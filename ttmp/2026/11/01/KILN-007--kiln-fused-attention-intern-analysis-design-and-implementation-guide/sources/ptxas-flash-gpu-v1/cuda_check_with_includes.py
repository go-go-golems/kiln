#!/usr/bin/env python3
"""Compile exported kernels with NVRTC (CUDA C++ → PTX) and ptxas (PTX → SASS, register counts).

  python test/cuda_check.py kernels.json --nvrtc /path/libnvrtc.so.12 --ptxas /path/ptxas [--arch 89]

Works without a GPU; it proves the generated CUDA compiles and reports registers and spills.
"""
import argparse, ctypes, json, os, re, subprocess, sys, tempfile

ap = argparse.ArgumentParser()
ap.add_argument("kernels")
ap.add_argument("--nvrtc", required=True)
ap.add_argument("--ptxas", required=True)
ap.add_argument("--arch", default="89")
a = ap.parse_args()

lib = ctypes.CDLL(a.nvrtc)
prog_t = ctypes.c_void_p

def check(r, what):
    if r != 0:
        lib.nvrtcGetErrorString.restype = ctypes.c_char_p
        raise RuntimeError(f"{what}: {lib.nvrtcGetErrorString(r).decode()}")

def to_ptx(src, name):
    prog = prog_t()
    check(lib.nvrtcCreateProgram(ctypes.byref(prog), src.encode(), (name + ".cu").encode(), 0, None, None), "create")
    opts = [f"--gpu-architecture=compute_{a.arch}".encode(), b"-std=c++14", b"--use_fast_math", b"--include-path=/usr/local/cuda/include"]
    arr = (ctypes.c_char_p * len(opts))(*opts)
    r = lib.nvrtcCompileProgram(prog, len(opts), arr)
    size = ctypes.c_size_t()
    lib.nvrtcGetProgramLogSize(prog, ctypes.byref(size))
    log = ctypes.create_string_buffer(size.value)
    lib.nvrtcGetProgramLog(prog, log)
    if r != 0:
        raise RuntimeError("nvrtc: " + log.value.decode()[-1500:])
    lib.nvrtcGetPTXSize(prog, ctypes.byref(size))
    ptx = ctypes.create_string_buffer(size.value)
    lib.nvrtcGetPTX(prog, ptx)
    lib.nvrtcDestroyProgram(ctypes.byref(prog))
    return ptx.value.decode()

kernels = json.load(open(a.kernels))
bad = 0
with tempfile.TemporaryDirectory() as d:
    for k in kernels:
        try:
            ptx = to_ptx(k["cuda"], k["name"])
            p = os.path.join(d, "k.ptx")
            open(p, "w").write(ptx)
            r = subprocess.run([a.ptxas, f"-arch=sm_{a.arch}", "-v", "-o", os.path.join(d, "k.cubin"), p], capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError("ptxas: " + r.stderr[-800:])
            regs = re.findall(r"Used (\d+) registers", r.stderr)
            spill = re.findall(r"(\d+) bytes spill stores", r.stderr)
            smem = re.findall(r"(\d+) bytes smem", r.stderr)
            note = f"regs {regs[-1] if regs else '?'}, smem {smem[-1] if smem else 0} B" + (f", SPILLS {spill[-1]} B" if spill and spill[-1] != "0" else "")
            print(f"ok   {k['preset']} {k['name']:<34} {k['row']:<44} {note}")
        except Exception as e:
            bad += 1
            print(f"FAIL {k['preset']} {k['name']} {k['row']}: {str(e)[:600]}")
print(f"{len(kernels) - bad}/{len(kernels)} kernels compile for sm_{a.arch}")
sys.exit(1 if bad else 0)
