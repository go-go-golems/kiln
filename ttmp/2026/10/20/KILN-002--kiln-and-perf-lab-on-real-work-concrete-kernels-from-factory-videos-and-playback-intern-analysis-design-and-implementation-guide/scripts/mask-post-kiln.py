#!/usr/bin/env python3
"""C2b (KILN-002, guide §18, §20.1): the W-28 kernels against Playback's own mask post-processing, through the wgpu
launcher (Metal on a Mac). Same Python as mask-post-reference.py, plus the wgpu package.

  mask-post-kiln.py check --set SET.json --playback DIR --out JSON
      every case of mask-post-reference.py (fixture people and stress masks, three geometries) at the bucket the engine
      would choose and at the largest bucket (padding must not change a pixel); counts differing pixels
  mask-post-kiln.py time  --set SET.json --playback DIR --out JSON [--reps 15]
      per program: median wall time of a dispatch (write once, then dispatch + wait, repeated), and the CPU loop it
      replaces (Playback's functions over the same masks) on this machine

SET.json is a kiln-program-set/1 of W-28 (kiln-export.mjs --preset W-28 --param detections=…,… --param geometry=…
--param form=…).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, "/Volumes/SSD/code/kiln/runtime/python")
import kiln_launch  # noqa: E402

_spec = importlib.util.spec_from_file_location("mask_post_reference", HERE / "mask-post-reference.py")
ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ref)


def device():
    """A wgpu device with the adapter's own storage limits (the default 128 MiB binding is too small for the largest
    buckets; Playback runs these kernels through CUDA, which has no such limit)."""
    import wgpu

    adapter = wgpu.gpu.request_adapter_sync(power_preference="high-performance")
    keep = ("max-storage-buffer-binding-size", "max-buffer-size", "max-compute-workgroups-per-dimension")
    dev = adapter.request_device_sync(required_limits={k: adapter.limits[k] for k in keep})
    return dev, adapter.info


class Programs:
    """The set's programs by (geometry, form, bucket), opened lazily on one device."""

    def __init__(self, path: str, dev):
        self.set = json.loads(Path(path).read_text())["programs"]
        self.dev, self.open = dev, {}

    def keys(self):
        return [(p["params"]["geometry"], p["params"]["form"], p["params"]["detections"]) for p in self.set]

    def buckets(self, geometry: str, form: str) -> list[int]:
        return sorted(b for g, f, b in self.keys() if g == geometry and f == form)

    def get(self, geometry: str, form: str, bucket: int):
        key = (geometry, form, bucket)
        if key not in self.open:
            p = next(p for p in self.set if (p["params"]["geometry"], p["params"]["form"], p["params"]["detections"]) == key)
            self.open[key] = kiln_launch.WgpuProgram(p, device=self.dev)
        return self.open[key]

    def close(self):
        for prog in self.open.values():
            prog.close()


def run(prog, stack: np.ndarray, bucket: int) -> np.ndarray:
    """The kernels on ``stack`` padded with zero masks to ``bucket``; the first n outputs as uint8."""
    padded = np.zeros((bucket, 640, 640), np.uint8)
    padded[: len(stack)] = stack
    return prog.run(masks=padded)["out"][: len(stack)].astype(np.uint8)


def cases(playback: Path, w: int, h: int):
    return ref.detections(playback / "services/redaction/tests/fixtures", w, h) + ref.stress(w, h, seed=w + h)


def cmd_check(args, programs: Programs) -> dict:
    unletterbox, smooth = ref.import_playback(Path(args.playback))
    rows, total, differing = [], 0, 0
    for geometry, form in sorted({(g, f) for g, f, _ in programs.keys()}):
        w, h = map(int, geometry.split("x"))
        buckets = programs.buckets(geometry, form)
        for name, stack in cases(Path(args.playback), w, h):
            want = ref.cpu_post(stack, w, h, unletterbox, smooth)
            fit = next((b for b in buckets if b >= len(stack)), None)
            for bucket in dict.fromkeys(b for b in (fit, buckets[-1]) if b is not None):
                got = run(programs.get(geometry, form, bucket), stack, bucket)
                diff = int((got != want).sum())
                rows.append({"geometry": geometry, "form": form, "bucket": bucket, "case": name, "detections": int(len(stack)),
                             "pixels": int(want.size), "covered": int(want.sum()), "differing": diff})
                total += want.size
                differing += diff
                print(f"{geometry} {form:9} bucket {bucket:3} {name:9} n={len(stack):2} differing {diff}", flush=True)
    return {"mode": "check", "rows": rows, "pixels": total, "differing": differing}


def cmd_time(args, programs: Programs) -> dict:
    unletterbox, smooth = ref.import_playback(Path(args.playback))
    rows = []
    for geometry, form, bucket in programs.keys():
        w, h = map(int, geometry.split("x"))
        stack = np.concatenate([s for _, s in ref.detections(Path(args.playback) / "services/redaction/tests/fixtures", w, h)])
        stack = np.resize(stack, (bucket, 640, 640))
        prog = programs.get(geometry, form, bucket)
        prog.write("masks", stack)
        prog.dispatch()
        prog.read("out")                                            # warm-up: pipelines, first submission
        gpu = []
        for _ in range(args.reps):
            t0 = time.perf_counter()
            prog.dispatch()
            prog.device.queue.read_buffer(prog._bufs[prog.outputs["out"]["buffer"]], 0, 4)   # wait without copying out
            gpu.append((time.perf_counter() - t0) * 1000)
        cpu = []
        for _ in range(max(3, args.reps // 3)):
            t0 = time.perf_counter()
            ref.cpu_post(stack, w, h, unletterbox, smooth)
            cpu.append((time.perf_counter() - t0) * 1000)
        row = {"geometry": geometry, "form": form, "bucket": bucket, "gpuMs": round(statistics.median(gpu), 3),
               "gpuMsPerMask": round(statistics.median(gpu) / bucket, 4), "cpuMs": round(statistics.median(cpu), 3),
               "cpuMsPerMask": round(statistics.median(cpu) / bucket, 4)}
        rows.append(row)
        print(json.dumps(row), flush=True)
    return {"mode": "time", "reps": args.reps, "rows": rows}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["check", "time"])
    p.add_argument("--set", required=True)
    p.add_argument("--playback", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--reps", type=int, default=15)
    args = p.parse_args()
    dev, info = device()
    programs = Programs(args.set, dev)
    try:
        import cv2

        result = {"adapter": {k: info.get(k) for k in ("vendor", "architecture", "device", "description", "backend_type")},
                  "opencv": cv2.__version__, "set": args.set,
                  **{"check": cmd_check, "time": cmd_time}[args.mode](args, programs)}
    finally:
        programs.close()
    Path(args.out).write_text(json.dumps(result, indent=1) + "\n")
    if args.mode == "check":
        print(f"{result['differing']} of {result['pixels']} pixels differ")
    print(f"→ {args.out}")


if __name__ == "__main__":
    main()
