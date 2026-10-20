#!/usr/bin/env python3
"""Time Playback's REDACTION_MASK_POST=kiln path against its CPU loop on a CUDA host (KILN-002 C4).

Runs inside the redaction image with the C3 branch's ``services/redaction`` mounted and on PYTHONPATH, so it exercises
the same entry points the engine uses: ``KilnMaskPost.load`` (NVRTC compile of every program plus the self-check
against the CPU loop) and ``KilnMaskPost.run`` followed by the copy to the host, which is what ``_collect_with_slot``
does per frame. The CPU side is the engine's own per-mask loop (``_unletterbox_mask`` then ``_smooth_mask``).

Reported per geometry and mask count:
  gpu_ms     run() + .cpu(): pad, two kernels, copy of the source-sized masks to the host (wall clock, synchronised)
  kernel_ms  the two kernels alone, from CUDA events around run() with the input already padded on the device
  cpu_ms     the CPU loop over the same masks
Every timed GPU output is also compared with the CPU output; any differing pixel is reported.

    python3 mask-post-cuda-time.py --out /out/mask-post-cuda-time.json [--reps 15]
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import time

import numpy as np


def nvrtc_version() -> str:
    """The NVRTC the launcher finds by default (the image's toolkit), as major.minor."""
    import ctypes
    import glob

    path = sorted(glob.glob("/usr/local/cuda/lib64/libnvrtc.so.*"))[-1]
    lib = ctypes.CDLL(path)
    major, minor = ctypes.c_int(), ctypes.c_int()
    lib.nvrtcVersion(ctypes.byref(major), ctypes.byref(minor))
    return f"{major.value}.{minor.value} ({path.rsplit('/', 1)[-1]})"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--reps", type=int, default=15)
    ap.add_argument("--warmup", type=int, default=3)
    args = ap.parse_args()

    import cv2
    import torch

    from src import mask_post
    from src.kiln import kiln_launch
    from src.mask_post import KilnMaskPost, probe_masks, read_program_set
    from src.seg_engine import _smooth_mask
    from src.trt_engine import _letterbox_into, _unletterbox_mask

    def letterbox(h: int, w: int) -> tuple[float, int, int]:
        return _letterbox_into(np.zeros((h, w, 3), np.uint8), np.empty((640, 640, 3), np.uint8))

    def cpu_post(masks: np.ndarray, scale: float, px: int, py: int, h: int, w: int) -> np.ndarray:
        return np.stack([_smooth_mask(_unletterbox_mask(m, scale, px, py, (h, w)), 2.0) for m in masks])

    # The engine has initialised CUDA (TensorRT, torch) before KilnMaskPost.load runs; do the same, and time it apart
    # so that the compile figure below is NVRTC and module loading only.
    t0 = time.perf_counter()
    torch.zeros(1, device="cuda")
    torch.cuda.synchronize()
    cuda_init_s = time.perf_counter() - t0
    dev = torch.cuda.current_device()
    props = torch.cuda.get_device_properties(dev)

    # Compile cost alone: every program of the set, as load() does, without the self-check.
    specs = read_program_set()
    t0 = time.perf_counter()
    progs = [kiln_launch.CudaProgram(s.program, dev, allocate=False) for g in specs.values() for s in g]
    compile_s = time.perf_counter() - t0
    for p in progs:
        p.close()

    t0 = time.perf_counter()
    post = KilnMaskPost.load(
        smooth_px=2.0, dilate_px=0, canvas_hw=(640, 640), letterbox=letterbox, cpu_post=cpu_post
    )
    load_s = time.perf_counter() - t0

    rng = np.random.default_rng(20261020)
    rows = []
    differing_total = 0
    try:
        for (h, w) in sorted(specs):
            scale, px, py = letterbox(h, w)
            for n in [1, 2, 4, 8, 16, 32, 64, 100]:
                masks = probe_masks(n, rng)
                masks_gpu = torch.from_numpy(masks).cuda()
                assert post.supports(h, w, scale, px, py, n)
                want = cpu_post(masks, scale, px, py, h, w)

                gpu, cpu, kern = [], [], []
                differing = 0
                for i in range(args.warmup + args.reps):
                    torch.cuda.synchronize()
                    t = time.perf_counter()
                    got = post.run(masks_gpu, h, w).cpu().numpy()
                    dt_gpu = time.perf_counter() - t

                    start, end = torch.cuda.Event(enable_timing=True), torch.cuda.Event(enable_timing=True)
                    start.record()
                    out = post.run(masks_gpu, h, w)
                    end.record()
                    torch.cuda.synchronize()
                    dt_kern = start.elapsed_time(end) / 1e3
                    del out

                    t = time.perf_counter()
                    cpu_post(masks, scale, px, py, h, w)
                    dt_cpu = time.perf_counter() - t

                    if i >= args.warmup:
                        gpu.append(dt_gpu)
                        kern.append(dt_kern)
                        cpu.append(dt_cpu)
                        differing += int((got != want).sum())
                differing_total += differing
                row = {
                    "geometry": f"{w}x{h}",
                    "masks": n,
                    "gpu_ms": round(statistics.median(gpu) * 1e3, 3),
                    "kernel_ms": round(statistics.median(kern) * 1e3, 3),
                    "cpu_ms": round(statistics.median(cpu) * 1e3, 3),
                    "differing": differing,
                }
                rows.append(row)
                print(json.dumps(row), flush=True)
    finally:
        post.close()

    result = {
        "host": platform.node(),
        "machine": platform.machine(),
        "gpu": props.name,
        "capability": f"{props.major}.{props.minor}",
        "sms": props.multi_processor_count,
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "opencv": cv2.__version__,
        "nvrtc": nvrtc_version(),
        "programs": len(progs),
        "cuda_init_s": round(cuda_init_s, 3),
        "compile_s": round(compile_s, 3),
        "load_s": round(load_s, 3),
        "reps": args.reps,
        "rows": rows,
        "differing": differing_total,
        "mask_post_module": mask_post.__file__,
    }
    with open(args.out, "w") as f:
        json.dump(result, f, indent=1)
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}))


if __name__ == "__main__":
    main()
