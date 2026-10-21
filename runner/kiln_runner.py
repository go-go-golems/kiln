#!/usr/bin/env python3
"""kiln_runner.py: run Kiln Workbench kernels on a real CUDA GPU.

The workbench compiles programs to CUDA. This script is the other half, run by the Kiln driver inside the kiln-perf
image (kiln-kernels/1, KILN-003 guide §19.2): it compiles each kernel with nvcc, runs it on the same seeded inputs
the workbench uses, times it with CUDA events, and returns the outputs at sampled indices so the server can check
them against the page's reference. Counters and timelines are collectors that wrap this process (ncu, nsys).

  python kiln_runner.py device                         what GPU this is (JSON)
  python kiln_runner.py run bundle.json -o out.json    run a kiln-bundle/1; write kiln-results/1

Needs Python 3.8+, the CUDA toolkit (nvcc on PATH or $CUDA_HOME/bin) and a driver. No Python packages are needed:
inputs are generated on the host by the same mulberry32 generator the workbench uses, inside the compiled harness.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import socket
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

RUNNER_VERSION = "kiln_runner/2"
CACHE = Path(os.environ.get("KILN_CACHE", Path(tempfile.gettempdir()) / "kiln-runner-cache"))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def find_nvcc():
    for c in [shutil.which("nvcc"), os.path.join(os.environ.get("CUDA_HOME", "/usr/local/cuda"), "bin", "nvcc")]:
        if c and os.path.exists(c):
            return c
    raise SystemExit("nvcc not found: install the CUDA toolkit or set CUDA_HOME")


# ------------------------------------------------------------------ the harness
HARNESS = r"""
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cmath>
#include <cuda_runtime.h>

%(kernel)s

#define CK(x) do { cudaError_t e_ = (x); if (e_ != cudaSuccess) { printf("\n{\"error\": \"%%s at line %%d\"}\n", cudaGetErrorString(e_), __LINE__); return 1; } } while (0)

// mulberry32, exactly as the workbench (kernelInputs): with r the draw / 2^32, an f32 input holds r * 2 - 1 rounded to
// float and a u8 input floor(r * 256), which is the draw's top byte
static void* gen(size_t n, uint32_t seed, int u8) {
    void* h = malloc(n * (u8 ? 1 : sizeof(float)) + 4);
    uint32_t a = seed;
    for (size_t i = 0; i < n; i++) {
        a += 0x6D2B79F5u;
        uint32_t t = a;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        uint32_t r = t ^ (t >> 14);
        if (u8) ((uint8_t*)h)[i] = (uint8_t)(r >> 24);
        else ((float*)h)[i] = (float)((double)r / 4294967296.0 * 2.0 - 1.0);
    }
    return h;
}

static const size_t IN_SIZES[] = { %(in_sizes)s };
static const uint32_t IN_SEEDS[] = { %(in_seeds)s };
static const int IN_U8[] = { %(in_u8)s };
static const size_t SAMPLES[] = { %(samples)s };

int main(int argc, char** argv) {
    const int NIN = %(nin)d, REPS = argc > 1 ? atoi(argv[1]) : %(reps)d, WARM = argc > 2 ? atoi(argv[2]) : %(warmup)d;
    const size_t OUT = %(out)dULL, NS = sizeof(SAMPLES) / sizeof(SAMPLES[0]);
    void* d_in[NIN > 0 ? NIN : 1];
    for (int i = 0; i < NIN; i++) {
        const size_t bytes = IN_SIZES[i] * (IN_U8[i] ? 1 : sizeof(float));
        void* h = gen(IN_SIZES[i], IN_SEEDS[i], IN_U8[i]);
        CK(cudaMalloc(&d_in[i], bytes + 4));
        CK(cudaMemcpy(d_in[i], h, bytes, cudaMemcpyHostToDevice));
        free(h);
    }
    float* d_out;
    CK(cudaMalloc(&d_out, OUT * sizeof(float) + 4));
    CK(cudaMemset(d_out, 0xff, OUT * sizeof(float)));   // NaN, so unwritten outputs show up
    dim3 grid(%(grid)d), block(%(block)d);
    for (int i = 0; i < WARM; i++) %(name)s<<<grid, block>>>(%(args)s);
    CK(cudaGetLastError());
    CK(cudaDeviceSynchronize());
    cudaEvent_t e0, e1;
    CK(cudaEventCreate(&e0)); CK(cudaEventCreate(&e1));
    printf("{\"us_all\": [");
    for (int i = 0; i < REPS; i++) {
        CK(cudaEventRecord(e0));
        %(name)s<<<grid, block>>>(%(args)s);
        CK(cudaEventRecord(e1));
        CK(cudaEventSynchronize(e1));
        float ms = 0; CK(cudaEventElapsedTime(&ms, e0, e1));
        printf("%%s%%.4f", i ? ", " : "", ms * 1000.0f);
    }
    CK(cudaGetLastError());
    float* h_out = (float*)malloc(OUT * sizeof(float) + 4);
    CK(cudaMemcpy(h_out, d_out, OUT * sizeof(float), cudaMemcpyDeviceToHost));
    printf("], \"samples\": [");
    for (size_t i = 0; i < NS; i++) { float v = h_out[SAMPLES[i]]; if (!std::isfinite(v)) v = 1e30f; printf("%%s%%.9g", i ? ", " : "", v); }
    printf("]}\n");
    return 0;
}
"""

DEVICE_QUERY = r"""
#include <cstdio>
#include <cuda_runtime.h>
int main() {
    cudaDeviceProp p; int d = 0;
    if (cudaGetDevice(&d) != cudaSuccess || cudaGetDeviceProperties(&p, d) != cudaSuccess) { printf("{\"error\": \"no CUDA device\"}\n"); return 1; }
    int rt = 0, drv = 0; cudaRuntimeGetVersion(&rt); cudaDriverGetVersion(&drv);
    int clk = 0, mclk = 0, bus = 0;
    char pci[32] = "";
    cudaDeviceGetPCIBusId(pci, sizeof(pci), d);
    cudaDeviceGetAttribute(&clk, cudaDevAttrClockRate, d);
    cudaDeviceGetAttribute(&mclk, cudaDevAttrMemoryClockRate, d);
    cudaDeviceGetAttribute(&bus, cudaDevAttrGlobalMemoryBusWidth, d);
    printf("{\"name\": \"%s\", \"cc\": \"%d.%d\", \"sms\": %d, \"smemPerBlock\": %zu, \"smemPerSM\": %zu, \"regsPerSM\": %d, "
           "\"maxThreadsPerBlock\": %d, \"maxThreadsPerSM\": %d, \"clockMHz\": %d, \"memClockMHz\": %d, \"busBits\": %d, "
           "\"memGB\": %.1f, \"l2MB\": %.1f, \"runtime\": %d, \"driver\": %d, \"pciBusId\": \"%s\"}\n",
           p.name, p.major, p.minor, p.multiProcessorCount, p.sharedMemPerBlock, p.sharedMemPerMultiprocessor, p.regsPerMultiprocessor,
           p.maxThreadsPerBlock, p.maxThreadsPerMultiProcessor, clk / 1000, mclk / 1000, bus,
           p.totalGlobalMem / 1073741824.0, p.l2CacheSize / 1048576.0, rt, drv, pci);
    return 0;
}
"""


def build(source, tag, arch, nvcc):
    """Compile once per source; returns (binary path, registers or None)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1((source + arch).encode()).hexdigest()[:16]
    exe = CACHE / f"{tag}-{h}"
    regs_file = CACHE / f"{tag}-{h}.regs"
    if exe.exists():
        return str(exe), (int(regs_file.read_text()) if regs_file.exists() and regs_file.read_text().strip() else None)
    cu = CACHE / f"{tag}-{h}.cu"
    cu.write_text(source)
    cmd = [nvcc, "-O3", "-std=c++14", f"-arch={arch}", "-Xptxas", "-v", "-o", str(exe), str(cu)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("nvcc failed:\n" + (r.stderr or r.stdout)[-3000:])
    m = re.findall(r"Used (\d+) registers", r.stderr)
    regs = int(m[-1]) if m else None
    regs_file.write_text(str(regs) if regs is not None else "")
    return str(exe), regs


_device = None


def device_info(arch, nvcc):
    global _device
    if _device is None:
        exe, _ = build(DEVICE_QUERY, "devquery", arch, nvcc)
        r = subprocess.run([exe], capture_output=True, text=True, timeout=60)
        _device = json.loads(r.stdout.strip() or '{"error": "device query printed nothing"}')
        if "error" in _device:
            raise RuntimeError(_device["error"])
        _device.update(nvidia_smi(_device.get("pciBusId")))
        # the machine's own name: the device id must not depend on the route (SSH destination, URL) that reached it
        _device["hostname"] = socket.gethostname()
    return _device


# Stable facts only: every field enters the device fingerprint, so a field that changes between two
# probes (a current clock, a temperature) would make the same GPU look like a new device.
SMI_FIELDS = {"driver_version": "driverVersion", "persistence_mode": "persistenceMode", "clocks.max.sm": "maxSmClockMHz",
              "clocks.max.memory": "maxMemClockMHz", "uuid": "gpuUuid"}


def nvidia_smi(pci):
    """Driver version, persistence mode, maximum clocks and UUID of the GPU at `pci`, when nvidia-smi is present."""
    tool = shutil.which("nvidia-smi")
    if not tool or not pci:
        return {}
    cmd = [tool, "--query-gpu=" + ",".join(SMI_FIELDS), "--format=csv,noheader,nounits", "-i", pci]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    vals = [v.strip() for v in (r.stdout.strip().splitlines() or [""])[0].split(",")]
    if r.returncode != 0 or len(vals) != len(SMI_FIELDS):
        return {}
    out = {}
    for (field, key), v in zip(SMI_FIELDS.items(), vals):
        if not v or v.startswith("[N/A") or v.startswith("[Not"):
            continue
        out[key] = int(v) if v.isdigit() else v
    return out


def kernel_name(src):
    m = re.search(r"__global__\s+void\s+(?:__launch_bounds__\s*\([^)]*\)\s*)?(\w+)\s*\(", src)
    if not m:
        raise ValueError("no __global__ function in the kernel source")
    return m.group(1)


def run_kernel(k, reps, warmup, arch, nvcc):
    dtypes = [i.get("dtype", "f32") for i in k["inputs"]]
    for d in dtypes:
        if d not in ("f32", "u8"):
            raise ValueError(f"input dtype {d} is not supported by this runner")
    name = kernel_name(k["source"])
    nin = len(k["inputs"])
    src = HARNESS % {
        "kernel": k["source"], "name": name, "nin": nin, "reps": reps, "warmup": warmup,
        "in_sizes": ", ".join(str(int(i["size"])) for i in k["inputs"]) or "0",
        "in_seeds": ", ".join(f"{int(i['seed']) & 0xffffffff}u" for i in k["inputs"]) or "0u",
        "in_u8": ", ".join("1" if d == "u8" else "0" for d in dtypes) or "0",
        "samples": ", ".join(str(int(s)) for s in k["samples"]) or "0",
        "out": int(k["out"]), "grid": int(k["grid"]), "block": int(k["block"]),
        "args": ", ".join([f"({'const unsigned char' if d == 'u8' else 'float'}*)d_in[{i}]" for i, d in enumerate(dtypes)] + ["d_out"]),
    }
    exe, regs = build(src, re.sub(r"\W", "_", k["name"])[:40], arch, nvcc)
    r = subprocess.run([exe], capture_output=True, text=True, timeout=300)
    line = (r.stdout.strip().splitlines() or ["{}"])[-1]
    out = json.loads(line)
    if "error" in out:
        raise RuntimeError(out["error"])
    us = out["us_all"]
    return {"name": k["name"], "identity": k.get("identity"), "us_median": statistics.median(us), "us_min": min(us), "us_all": us, "samples": out["samples"], "regs": regs}


def run_bundle(bundle, arch, nvcc):
    if bundle.get("format") != "kiln-bundle/1":
        raise ValueError("not a kiln bundle (format kiln-bundle/1)")
    dev = device_info(arch, nvcc)
    reps, warmup = int(bundle.get("reps", 50)), int(bundle.get("warmup", 5))
    results = []
    for k in bundle["kernels"]:
        t0 = time.time()
        try:
            res = run_kernel(k, reps, warmup, arch, nvcc)
            log(f"  {k['name']:<36} {res['us_median']:9.2f} us  ({time.time() - t0:.1f} s)")
        except Exception as e:  # report per kernel; keep going
            res = {"name": k["name"], "identity": k.get("identity"), "error": str(e)[-2000:]}
            log(f"  {k['name']:<36} ERROR {str(e).splitlines()[0][:100]}")
        results.append(res)
    return {"format": "kiln-results/1", "device": dev, "kernels": results, "runner": RUNNER_VERSION, "created": time.strftime("%Y-%m-%dT%H:%M:%S")}


def default_arch():
    return os.environ.get("KILN_ARCH", "native")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("device", "run"):
        p = sub.add_parser(name)
        p.add_argument("--arch", default=default_arch(), help="nvcc -arch (default: native, or $KILN_ARCH)")
        if name == "run":
            p.add_argument("bundle", help="a kiln-bundle/1 file")
            p.add_argument("-o", "--out", default="results.json", help="the kiln-results/1 file to write")
    a = ap.parse_args()
    nvcc = find_nvcc()
    if a.cmd == "device":
        print(json.dumps(device_info(a.arch, nvcc), indent=1))
    else:
        bundle = json.loads(Path(a.bundle).read_text())
        log(f"{len(bundle['kernels'])} kernels")
        Path(a.out).write_text(json.dumps(run_bundle(bundle, a.arch, nvcc)))
        log(f"wrote {a.out}")


if __name__ == "__main__":
    main()
