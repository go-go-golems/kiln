#!/usr/bin/env python3
"""KILN-007: compile exported kernels ([{preset, name, row, cuda}]) to PTX with NVRTC only (no ptxas, no GPU).

  python3 05-nvrtc-compile.py kernels.json --nvrtc /path/libnvrtc.so.13 [--arch 121] [--include DIR]

Same NVRTC options as apps/workbench/test/cuda_check.py. Proves the generated CUDA C++ compiles for the
architecture; register and spill counts need ptxas (GPU host). Exits non-zero when any kernel fails.
"""
import argparse, ctypes, json, re, sys

ap = argparse.ArgumentParser()
ap.add_argument('kernels'); ap.add_argument('--nvrtc', required=True); ap.add_argument('--arch', default='121')
ap.add_argument('--include', action='append', default=[])
a = ap.parse_args()
lib = ctypes.CDLL(a.nvrtc)
lib.nvrtcGetErrorString.restype = ctypes.c_char_p

def ptx_of(src, name):
    prog = ctypes.c_void_p()
    r = lib.nvrtcCreateProgram(ctypes.byref(prog), src.encode(), (name + '.cu').encode(), 0, None, None)
    if r: raise RuntimeError('create: ' + lib.nvrtcGetErrorString(r).decode())
    opts = [f'--gpu-architecture=compute_{a.arch}'.encode(), b'-std=c++14', b'--use_fast_math', *[f'-I{d}'.encode() for d in a.include]]
    r = lib.nvrtcCompileProgram(prog, len(opts), (ctypes.c_char_p * len(opts))(*opts))
    size = ctypes.c_size_t(); lib.nvrtcGetProgramLogSize(prog, ctypes.byref(size))
    log = ctypes.create_string_buffer(size.value); lib.nvrtcGetProgramLog(prog, log)
    if r: raise RuntimeError('nvrtc: ' + log.value.decode()[-1500:])
    lib.nvrtcGetPTXSize(prog, ctypes.byref(size)); ptx = ctypes.create_string_buffer(size.value); lib.nvrtcGetPTX(prog, ptx)
    lib.nvrtcDestroyProgram(ctypes.byref(prog))
    return ptx.value.decode()

kernels = json.load(open(a.kernels)); bad = 0
for k in kernels:
    try:
        ptx = ptx_of(k['cuda'], k['name'])
        shared = sum(int(x) for x in re.findall(r'\.shared[^\n]*?\[(\d+)\]', ptx))
        print(f"ok   {k['preset']:<34} {k['row']:<36} ptx {len(ptx):>7} B, shared {shared} B")
    except Exception as e:
        bad += 1; print(f"FAIL {k['preset']} {k['row']}: {str(e)[:800]}")
print(f'{len(kernels) - bad}/{len(kernels)} kernels compile to PTX for compute_{a.arch}')
sys.exit(1 if bad else 0)
