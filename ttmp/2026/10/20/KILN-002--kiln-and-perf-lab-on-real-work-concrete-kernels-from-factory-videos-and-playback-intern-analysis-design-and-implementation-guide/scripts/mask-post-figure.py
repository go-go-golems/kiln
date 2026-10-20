#!/usr/bin/env python3
"""C2 figure (KILN-002): one calibration fixture at an inference geometry, post-processed by Playback's CPU loop and by
the W-28 kernels (wgpu). Shows only redacted output and mask silhouettes, never an unredacted person: the fixtures are
production camera frames.

  mask-post-figure.py --set SET.json --playback DIR --out PNG [--fixture image.04] [--geometry 768x416]

Panels: the frame redacted with the Kiln masks (black fill, as the service does); the per-person Kiln masks; the
pixels where CPU and Kiln differ; a 4× zoom of one mask edge before smoothing (the nearest-neighbour staircase) and
after (CPU and Kiln, which are identical).
"""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("mask_post_kiln", HERE / "mask-post-kiln.py")
mk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mk)
ref = mk.ref


def label(img: np.ndarray, text: str) -> np.ndarray:
    bar = np.full((28, img.shape[1], 3), 245, np.uint8)
    cv2.putText(bar, text, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)
    return np.vstack([bar, img])


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--set", required=True)
    p.add_argument("--playback", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--fixture", default="image.04")
    p.add_argument("--geometry", default="768x416")
    args = p.parse_args()
    pb = Path(args.playback)
    w, h = map(int, args.geometry.split("x"))
    unletterbox, smooth = ref.import_playback(pb)
    fixtures = pb / "services/redaction/tests/fixtures"
    stack = dict(ref.detections(fixtures, w, h))[args.fixture]
    cpu = ref.cpu_post(stack, w, h, unletterbox, smooth)

    dev, _ = mk.device()
    programs = mk.Programs(args.set, dev)
    bucket = next(b for b in programs.buckets(args.geometry, "separable") if b >= len(stack))
    kiln = mk.run(programs.get(args.geometry, "separable", bucket), stack, bucket)
    programs.close()
    diff = (cpu != kiln).any(axis=0)

    frame = cv2.imread(str(fixtures / f"{args.fixture}.png"), cv2.IMREAD_COLOR)
    frame = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
    redacted = frame.copy()
    redacted[kiln.any(axis=0)] = 0

    tones = [(90, 140, 200), (120, 190, 120), (200, 160, 90), (170, 120, 190), (90, 190, 190), (200, 110, 110)]
    people = np.full((h, w, 3), 24, np.uint8)
    for i, m in enumerate(kiln):
        people[m.astype(bool)] = tones[i % len(tones)]

    diff_img = np.full((h, w, 3), 24, np.uint8)
    diff_img[diff] = (0, 0, 255)
    cv2.putText(diff_img, f"{int((cpu != kiln).sum())} of {cpu.size:,} pixels differ", (16, h // 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (235, 235, 235), 1, cv2.LINE_AA)

    # zoom on the edge of the largest mask: before smoothing (nearest-neighbour staircase) and after
    big = int(np.argmax(kiln.reshape(len(kiln), -1).sum(1)))
    scale = min(640 / w, 640 / h)
    _, _, pad_x, pad_y = ref.letterbox(w, h)
    raw = unletterbox(stack[big], scale, pad_x, pad_y, (h, w))
    edge = np.argwhere(cv2.Canny(raw * 255, 50, 150) > 0)
    cy, cx = edge[len(edge) // 2]
    y0, x0 = int(np.clip(cy - 20, 0, h - 40)), int(np.clip(cx - 32, 0, w - 64))

    def zoom(m):
        crop = (m[y0:y0 + 40, x0:x0 + 64] * 255).astype(np.uint8)
        return cv2.cvtColor(cv2.resize(crop, (64 * 4, 40 * 4), interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR)

    top = np.hstack([label(redacted, f"{args.fixture} at {w}x{h}, redacted with the Kiln masks"),
                     label(people, f"{len(kiln)} person masks (W-28, bucket {bucket}, wgpu)")])
    zooms = np.hstack([label(zoom(raw), "edge before smoothing (4x)"), label(zoom(cpu[big]), "after: OpenCV (CPU)"),
                       label(zoom(kiln[big]), "after: Kiln kernels")])
    bottom_left = label(diff_img, "CPU vs Kiln")
    pad = np.full((bottom_left.shape[0], max(0, top.shape[1] - bottom_left.shape[1] - zooms.shape[1]), 3), 255, np.uint8)
    zooms = np.vstack([zooms, np.full((bottom_left.shape[0] - zooms.shape[0], zooms.shape[1], 3), 255, np.uint8)])
    out = np.vstack([top, np.hstack([bottom_left, pad, zooms])])
    cv2.imwrite(args.out, out)
    print(f"{args.fixture}: {len(kiln)} masks, {int((cpu != kiln).sum())} differing pixels → {args.out}")


if __name__ == "__main__":
    main()
