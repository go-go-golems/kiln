#!/usr/bin/env python3
"""kiln_runner.py: run Kiln Workbench kernels on a real CUDA GPU.

The workbench compiles programs to CUDA. This script is the other half: on a machine with an
NVIDIA GPU it compiles each kernel with nvcc, runs it on the same seeded inputs the workbench
uses, times it with CUDA events, optionally profiles it with Nsight Compute, and returns the
outputs at sampled indices so the workbench can check them against its reference.

  python kiln_runner.py device                         what GPU this is (JSON)
  python kiln_runner.py run bundle.json -o out.json    run an exported bundle; import out.json
  python kiln_runner.py run - --out -                  bundle on stdin, results on stdout (the Kiln server)
  python kiln_runner.py serve kiln-workbench.html      serve the workbench with a live CUDA device
       [--port 8765] [--host 127.0.0.1] [--arch sm_89] [--ncu]

Needs Python 3.8+, the CUDA toolkit (nvcc on PATH or $CUDA_HOME/bin) and a driver. ncu is optional.
No Python packages are needed: inputs are generated on the host by the same mulberry32 generator
the workbench uses, inside the compiled harness.

Security: serve compiles and runs CUDA code that is POSTed to it. It binds to 127.0.0.1 by
default, answers only requests whose Host is this loopback address and port, refuses cross-origin
requests, and runs code only for requests carrying the session token it writes into the page it
serves (X-Kiln-Token); do not expose it to a network you do not trust.
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RUNNER_VERSION = "kiln_runner/2"
CACHE = Path(os.environ.get("KILN_CACHE", Path(tempfile.gettempdir()) / "kiln-runner-cache"))
NCU_METRICS = {
    "ncu_sm_throughput_pct": "sm__throughput.avg.pct_of_peak_sustained_elapsed",
    "ncu_dram_throughput_pct": "dram__throughput.avg.pct_of_peak_sustained_elapsed",
    "ncu_achieved_occupancy_pct": "sm__warps_active.avg.pct_of_peak_sustained_active",
    "ncu_ld_sectors": "l1tex__t_sectors_pipe_lsu_mem_global_op_ld.sum",
    "ncu_ld_requests": "l1tex__t_requests_pipe_lsu_mem_global_op_ld.sum",
    "ncu_smem_bank_conflicts": "l1tex__data_bank_conflicts_pipe_lsu_mem_shared.sum",
    "ncu_branch_uniform_pct": "smsp__sass_average_branch_targets_threads_uniform.pct",
    "ncu_registers": "launch__registers_per_thread",
    "ncu_duration_us": "gpu__time_duration.sum",
}


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

// mulberry32, exactly as the workbench: value = r * 2 - 1, rounded to float
static float* gen(size_t n, uint32_t seed) {
    float* h = (float*)malloc(n * sizeof(float) + 4);
    uint32_t a = seed;
    for (size_t i = 0; i < n; i++) {
        a += 0x6D2B79F5u;
        uint32_t t = a;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        uint32_t r = t ^ (t >> 14);
        h[i] = (float)((double)r / 4294967296.0 * 2.0 - 1.0);
    }
    return h;
}

static const size_t IN_SIZES[] = { %(in_sizes)s };
static const uint32_t IN_SEEDS[] = { %(in_seeds)s };
static const size_t SAMPLES[] = { %(samples)s };

int main(int argc, char** argv) {
    const int NIN = %(nin)d, REPS = argc > 1 ? atoi(argv[1]) : %(reps)d, WARM = argc > 2 ? atoi(argv[2]) : %(warmup)d;
    const size_t OUT = %(out)dULL, NS = sizeof(SAMPLES) / sizeof(SAMPLES[0]);
    float* d_in[NIN > 0 ? NIN : 1];
    for (int i = 0; i < NIN; i++) {
        float* h = gen(IN_SIZES[i], IN_SEEDS[i]);
        CK(cudaMalloc(&d_in[i], IN_SIZES[i] * sizeof(float) + 4));
        CK(cudaMemcpy(d_in[i], h, IN_SIZES[i] * sizeof(float), cudaMemcpyHostToDevice));
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


def run_kernel(k, reps, warmup, arch, nvcc, ncu):
    name = kernel_name(k["source"])
    nin = len(k["inputs"])
    src = HARNESS % {
        "kernel": k["source"], "name": name, "nin": nin, "reps": reps, "warmup": warmup,
        "in_sizes": ", ".join(str(int(i["size"])) for i in k["inputs"]) or "0",
        "in_seeds": ", ".join(f"{int(i['seed']) & 0xffffffff}u" for i in k["inputs"]) or "0u",
        "samples": ", ".join(str(int(s)) for s in k["samples"]) or "0",
        "out": int(k["out"]), "grid": int(k["grid"]), "block": int(k["block"]),
        "args": ", ".join([f"d_in[{i}]" for i in range(nin)] + ["d_out"]),
    }
    exe, regs = build(src, re.sub(r"\W", "_", k["name"])[:40], arch, nvcc)
    r = subprocess.run([exe], capture_output=True, text=True, timeout=300)
    line = (r.stdout.strip().splitlines() or ["{}"])[-1]
    out = json.loads(line)
    if "error" in out:
        raise RuntimeError(out["error"])
    us = out["us_all"]
    res = {"name": k["name"], "identity": k.get("identity"), "us_median": statistics.median(us), "us_min": min(us), "us_all": us, "samples": out["samples"], "regs": regs}
    if ncu:
        res["ncu"] = profile(exe)
    return res


def profile(exe):
    tool = shutil.which("ncu")
    if not tool:
        return {"ncu_error": "ncu not on PATH"}
    cmd = [tool, "--csv", "--metrics", ",".join(NCU_METRICS.values()), exe, "1", "0"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    rows = [l for l in r.stdout.splitlines() if l.startswith('"')]
    if len(rows) < 2:
        return {"ncu_error": (r.stderr or r.stdout)[-300:]}
    import csv
    vals = {}
    for row in csv.DictReader(rows):
        vals[row.get("Metric Name")] = (row.get("Metric Value") or "").replace(",", "")
    out = {}
    for key, metric in NCU_METRICS.items():
        v = vals.get(metric)
        try:
            out[key] = float(v)
        except (TypeError, ValueError):
            pass
    if out.get("ncu_ld_requests"):
        out["ncu_ld_sectors_per_req"] = out["ncu_ld_sectors"] / out["ncu_ld_requests"]
    if "ncu_duration_us" in out:
        out["ncu_duration_us"] /= 1000.0      # ncu reports ns
    return out


def run_bundle(bundle, arch, nvcc, ncu=False):
    if bundle.get("format") != "kiln-bundle/1":
        raise ValueError("not a kiln bundle (format kiln-bundle/1)")
    dev = device_info(arch, nvcc)
    reps, warmup = int(bundle.get("reps", 50)), int(bundle.get("warmup", 5))
    ncu = ncu or bool(bundle.get("ncu"))
    results = []
    for k in bundle["kernels"]:
        t0 = time.time()
        try:
            res = run_kernel(k, reps, warmup, arch, nvcc, ncu)
            log(f"  {k['name']:<36} {res['us_median']:9.2f} us  ({time.time() - t0:.1f} s)")
        except Exception as e:  # report per kernel; keep going
            res = {"name": k["name"], "identity": k.get("identity"), "error": str(e)[-2000:]}
            log(f"  {k['name']:<36} ERROR {str(e).splitlines()[0][:100]}")
        results.append(res)
    return {"format": "kiln-results/1", "device": dev, "kernels": results, "runner": RUNNER_VERSION, "created": time.strftime("%Y-%m-%dT%H:%M:%S")}


def read_stdin_bundle():
    """The first JSON document on stdin: one line (the server writes one) or a pretty-printed file piped in."""
    buf = ""
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        buf += line
        if line.rstrip().endswith("}"):
            try:
                return json.loads(buf)
            except ValueError:
                pass
    return json.loads(buf)


def exit_on_eof():
    """Stop this process group when stdin closes: the caller (the Kiln server, or its SSH connection) went away."""
    def watch():
        try:
            sys.stdin.read()
        finally:
            log("stdin closed: the caller went away; stopping")
            try:
                os.killpg(os.getpgrp(), signal.SIGTERM)
            finally:
                os._exit(143)
    threading.Thread(target=watch, daemon=True).start()


def default_arch():
    return os.environ.get("KILN_ARCH", "native")


# ------------------------------------------------------------------ serve
def with_token(page, token):
    """The page with the session token in a meta tag, which the page sends back as X-Kiln-Token."""
    meta = f'<meta name="kiln-token" content="{token}">'.encode()
    m = re.search(rb"<head[^>]*>", page, re.I)
    return page[:m.end()] + b"\n" + meta + page[m.end():] if m else meta + b"\n" + page


def serve(html, host, port, arch, nvcc, ncu):
    token = secrets.token_hex(32)
    page = with_token(Path(html).read_bytes(), token) if html else None
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"} if host in ("127.0.0.1", "localhost", "::1") else None

    class H(BaseHTTPRequestHandler):
        def _send(self, code, body, ctype="application/json"):
            b = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(code)
            self.send_header("content-type", ctype)
            self.send_header("content-length", str(len(b)))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(b)

        def _same_origin(self):
            origin = self.headers.get("Origin")
            return origin is None or origin == f"http://{self.headers.get('Host')}"

        def _host_ok(self):
            # a DNS-rebinding page reaches 127.0.0.1 under its own host name: refuse it, page included
            if hosts is None or (self.headers.get("Host") or "").lower() in hosts:
                return True
            self._send(403, {"error": "bad_host"})
            return False

        def _token_ok(self):
            return secrets.compare_digest(self.headers.get("X-Kiln-Token") or "", token)

        def do_GET(self):
            if not self._host_ok():
                return
            if self.path in ("/", "/index.html", "/kiln-workbench.html"):
                if not page:
                    return self._send(404, b"start the runner with the workbench page: kiln_runner.py serve kiln-workbench.html", "text/plain")
                return self._send(200, page, "text/html; charset=utf-8")
            if self.path == "/api/device":
                if not self._same_origin():
                    return self._send(403, {"error": "cross-origin request refused"})
                try:
                    return self._send(200, device_info(arch, nvcc))
                except Exception as e:
                    return self._send(500, {"error": str(e)})
            self._send(404, {"error": "not found"})

        def do_POST(self):
            if not self._host_ok():
                return
            if self.path != "/api/run":
                return self._send(404, {"error": "not found"})
            if not self._same_origin() or not (self.headers.get("content-type") or "").startswith("application/json"):
                return self._send(403, {"error": "refused: same-origin application/json only"})
            if not self._token_ok():
                return self._send(403, {"error": "bad_token: X-Kiln-Token must be the token in the served page"})
            n = int(self.headers.get("content-length") or 0)
            if n > 64 * 1024 * 1024:
                return self._send(413, {"error": "bundle too large"})
            try:
                bundle = json.loads(self.rfile.read(n))
                log(f"run: {len(bundle.get('kernels', []))} kernels")
                return self._send(200, run_bundle(bundle, arch, nvcc, ncu))
            except Exception as e:
                return self._send(400, {"error": str(e)})

        def log_message(self, fmt, *args):
            pass

    if host not in ("127.0.0.1", "localhost", "::1"):
        log(f"WARNING: serving on {host}: anyone who can reach this port can run CUDA code on this machine")
    srv = ThreadingHTTPServer((host, port), H)
    try:
        info = device_info(arch, nvcc)
        log(f"device: {info.get('name')} (sm_{info.get('cc', '?').replace('.', '')}, {info.get('sms')} SMs)")
    except Exception as e:
        log(f"device query failed: {e}")
    log(f"Kiln runner: open http://{host}:{port}/  (Ctrl-C stops)")
    srv.serve_forever()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("device", "run", "serve"):
        p = sub.add_parser(name)
        p.add_argument("--arch", default=default_arch(), help="nvcc -arch (default: native, or $KILN_ARCH)")
        if name == "run":
            p.add_argument("bundle", help="bundle file, or - for stdin")
            p.add_argument("-o", "--out", default="results.json", help="results file, or - for stdout")
            p.add_argument("--ncu", action="store_true", help="also profile each kernel with Nsight Compute")
            p.add_argument("--exit-on-eof", action="store_true", help="with run -: stop when stdin closes (the caller went away)")
        if name == "serve":
            p.add_argument("html", nargs="?", default="kiln-workbench.html")
            p.add_argument("--host", default="127.0.0.1")
            p.add_argument("--port", type=int, default=8765)
            p.add_argument("--ncu", action="store_true")
    a = ap.parse_args()
    nvcc = find_nvcc()
    if a.cmd == "device":
        print(json.dumps(device_info(a.arch, nvcc), indent=1))
    elif a.cmd == "run":
        bundle = read_stdin_bundle() if a.bundle == "-" else json.loads(Path(a.bundle).read_text())
        if a.exit_on_eof and a.bundle == "-":
            exit_on_eof()
        log(f"{len(bundle['kernels'])} kernels")
        res = run_bundle(bundle, a.arch, nvcc, a.ncu)
        if a.out == "-":
            sys.stdout.write(json.dumps(res))
            sys.stdout.flush()
        else:
            Path(a.out).write_text(json.dumps(res))
            log(f"wrote {a.out}: import it in the workbench (Devices → Import results)")
    else:
        html = a.html if Path(a.html).exists() else None
        if not html:
            log(f"{a.html} not found: the API works, but / will not serve the workbench")
        serve(html, a.host, a.port, a.arch, nvcc, a.ncu)


if __name__ == "__main__":
    main()
