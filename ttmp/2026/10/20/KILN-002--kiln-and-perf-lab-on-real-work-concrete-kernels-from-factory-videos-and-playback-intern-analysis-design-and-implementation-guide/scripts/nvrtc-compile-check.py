#!/usr/bin/env python3
"""C3 (KILN-002): compile every CUDA kernel of a kiln-program-set/1 with NVRTC, without a GPU.

  nvrtc-compile-check.py SET.json --arch 120,121 [--out JSON]

NVRTC needs no device or driver, so this runs in a plain Linux container with the `nvidia-cuda-nvrtc` wheel. It uses
the same options as kiln_launch.CudaProgram (one --gpu-architecture flag, NVRTC defaults otherwise) and reports, per
kernel and architecture, whether a CUBIN came out, its size, and any log. It proves the generated CUDA compiles for
the target, not that it computes the right thing: that needs the GPU (PN.1 / C4).
"""
from __future__ import annotations

import argparse
import ctypes
import glob
import json
import site
import sys
import time
from pathlib import Path


def nvrtc():
    pats = [f"{p}/nvidia/**/libnvrtc.so*" for p in site.getsitepackages()]
    for pat in pats:
        for cand in sorted(glob.glob(pat, recursive=True)):
            if "builtins" in cand or "alt" in cand:
                continue
            try:
                return ctypes.CDLL(cand), cand
            except OSError:
                pass
    raise SystemExit(f"no libnvrtc under {pats}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("set")
    p.add_argument("--arch", default="120,121")
    p.add_argument("--out")
    args = p.parse_args()
    n, path = nvrtc()
    VP, I = ctypes.c_void_p, ctypes.c_int
    n.nvrtcGetErrorString.restype = ctypes.c_char_p
    major, minor = I(), I()
    n.nvrtcVersion(ctypes.byref(major), ctypes.byref(minor))
    doc = json.loads(Path(args.set).read_text())
    programs = doc["programs"] if doc.get("format") == "kiln-program-set/1" else [doc]
    rows, fails = [], 0
    for prog in programs:
        for k in prog["kernels"]:
            for arch in args.arch.split(","):
                h = VP()
                n.nvrtcCreateProgram(ctypes.byref(h), k["cuda"].encode(), f"{k['name']}.cu".encode(), 0, None, None)
                opts = (ctypes.c_char_p * 1)(f"--gpu-architecture=sm_{arch}".encode())
                t0 = time.perf_counter()
                r = n.nvrtcCompileProgram(h, 1, opts)
                ms = (time.perf_counter() - t0) * 1000
                size = ctypes.c_size_t()
                n.nvrtcGetProgramLogSize(h, ctypes.byref(size))
                log = ctypes.create_string_buffer(size.value)
                n.nvrtcGetProgramLog(h, log)
                cubin = ctypes.c_size_t()
                if r == 0:
                    n.nvrtcGetCUBINSize(h, ctypes.byref(cubin))
                n.nvrtcDestroyProgram(ctypes.byref(h))
                ok = r == 0 and cubin.value > 0
                fails += not ok
                rows.append({"program": prog["params"], "kernel": k["name"], "arch": f"sm_{arch}", "ok": ok,
                             "result": n.nvrtcGetErrorString(r).decode(), "cubinBytes": cubin.value,
                             "compileMs": round(ms, 1), "log": log.value.decode(errors="replace").strip()})
                print(f"{k['name']:24} sm_{arch} {'ok' if ok else 'FAIL'} {cubin.value:6} B {ms:6.1f} ms", flush=True)
    result = {"nvrtc": f"{major.value}.{minor.value}", "library": path, "kernels": len(rows), "failures": fails,
              "compileMsTotal": round(sum(r["compileMs"] for r in rows), 1), "rows": rows}
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=1) + "\n")
    print(f"NVRTC {result['nvrtc']}: {len(rows) - fails} of {len(rows)} compiled; {result['compileMsTotal']} ms in all")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
