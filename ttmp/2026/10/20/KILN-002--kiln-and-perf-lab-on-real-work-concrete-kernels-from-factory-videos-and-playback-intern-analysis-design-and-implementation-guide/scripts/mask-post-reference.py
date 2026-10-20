#!/usr/bin/env python3
"""C2a (KILN-002, guide §18): can the redaction mask post-processing be reproduced bit for bit, before any kernel?

Run with a Python that has Playback's pinned OpenCV (opencv-python-headless 4.13.0.92) and NumPy:

  mask-post-reference.py check --playback DIR --out JSON

Imports Playback's own `_unletterbox_mask` (src/trt_engine.py) and `_smooth_mask` (src/seg_engine.py) as the
reference, and checks three claims:

1. weights:  cv2.GaussianBlur on CV_8U with ksize (0, 0), sigma 2 uses 13 fixed-point weights k_i / 256; this script
             recovers the k_i from an impulse on a one-row image.
2. blur:     with those weights, the sum over a reflect-101 neighbourhood, computed exactly, rounded half up, equals
             cv2.GaussianBlur on random 8-bit images, and therefore `_smooth_mask` (≥ 128) equals `sum ≥ 127.5`.
3. nearest:  `_unletterbox_mask`'s INTER_NEAREST reads source row ⌊y·new_h/H⌋ + pad_y and column ⌊x·new_w/W⌋ + pad_x.

Inputs are per-person masks built from the five calibration fixtures (`tests/fixtures/image.0N.gt_mask.webp`) at each
inference geometry, plus random stress masks (ellipses, lines, single pixels, noise, full). `detections()` and
`stress()` are imported by mask-post-kiln.py, so both check the same inputs.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

CANVAS = 640
GEOMETRIES = [(768, 416), (640, 480), (768, 576)]       # (W, H): 16:9 above 768 px, VGA, 4:3 above 768 px
SIGMA = 2.0


def letterbox(w: int, h: int) -> tuple[int, int, int, int]:
    """`_letterbox_into`'s geometry for an (h, w) frame on the 640 × 640 canvas: new_w, new_h, pad_x, pad_y."""
    scale = min(CANVAS / w, CANVAS / h)
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    return new_w, new_h, (CANVAS - new_w) // 2, (CANVAS - new_h) // 2


def fixed_weights(sigma: float = SIGMA) -> list[int]:
    """k_i with weight k_i / 256: blur a one-row image holding one 255 (reflect-101 makes every row the same row, so
    the vertical pass multiplies by Σ w_y = 1); 255·k/256 rounds to k for k < 128."""
    row = np.zeros((1, 64), np.uint8)
    row[0, 32] = 255
    out = cv2.GaussianBlur(row, ksize=(0, 0), sigmaX=sigma)[0]
    k = [int(v) for v in out[32 - 6: 32 + 7][::-1]]
    if sum(k) != 256 or out.sum() != 256 or max(k) >= 128:
        raise SystemExit(f"impulse does not reveal 8-bit fixed-point weights: {k} (sum {sum(k)})")
    return k


def reflect101(i: np.ndarray, n: int) -> np.ndarray:
    a = np.abs(i)
    return np.minimum(a, 2 * (n - 1) - a)


def blur_exact(img: np.ndarray, k: list[int]) -> np.ndarray:
    """The 13 × 13 separable sum Σ (k_i k_j / 65536) · img, in integers (exact), as a float64 array."""
    h, w = img.shape
    r = len(k) // 2
    x = img.astype(np.int64)
    xs = np.arange(w)
    hor = sum(k[t + r] * x[:, reflect101(xs + t, w)] for t in range(-r, r + 1))       # × 256
    ys = np.arange(h)
    ver = sum(k[t + r] * hor[reflect101(ys + t, h), :] for t in range(-r, r + 1))     # × 65536
    return ver / 65536.0


def smooth_exact(mask01: np.ndarray, k: list[int]) -> np.ndarray:
    return (blur_exact(mask01.astype(np.uint8) * 255, k) >= 127.5).astype(np.uint8)


# ------------------------------------------------------------------------------------------------- inputs
def _place(small: np.ndarray, w: int, h: int) -> np.ndarray:
    """A binary (h, w) inference-size mask on the 640 × 640 letterbox canvas, as the engine sees it."""
    new_w, new_h, pad_x, pad_y = letterbox(w, h)
    canvas = np.zeros((CANVAS, CANVAS), np.uint8)
    canvas[pad_y: pad_y + new_h, pad_x: pad_x + new_w] = cv2.resize(small * 255, (new_w, new_h), interpolation=cv2.INTER_LINEAR) >= 128
    return canvas


def detections(fixtures: Path, w: int, h: int) -> list[tuple[str, np.ndarray]]:
    """One (n, 640, 640) uint8 {0, 1} stack per fixture: the ground-truth person union at the inference size, split into
    connected components (one per person), components under 50 px dropped."""
    out = []
    for gt in sorted(fixtures.glob("image.*.gt_mask.webp")):
        mask = cv2.imread(str(gt), cv2.IMREAD_GRAYSCALE) > 127
        small = (cv2.resize(mask.astype(np.uint8) * 255, (w, h), interpolation=cv2.INTER_AREA) >= 128).astype(np.uint8)
        n, labels = cv2.connectedComponents(_place(small, w, h))
        comps = [(labels == i).astype(np.uint8) for i in range(1, n) if (labels == i).sum() >= 50]
        out.append((gt.name.split(".gt_mask")[0], np.stack(comps)))
    return out


def stress(w: int, h: int, seed: int) -> list[tuple[str, np.ndarray]]:
    """Masks that put the border handling and the rounding under pressure, on the content region of the canvas."""
    rng = np.random.default_rng(seed)
    new_w, new_h, pad_x, pad_y = letterbox(w, h)
    sets = []

    def canvas_of(content: np.ndarray) -> np.ndarray:
        c = np.zeros((CANVAS, CANVAS), np.uint8)
        c[pad_y: pad_y + new_h, pad_x: pad_x + new_w] = content
        return c

    ell = []
    for _ in range(16):
        m = np.zeros((new_h, new_w), np.uint8)
        cx, cy = rng.integers(-20, new_w + 20), rng.integers(-20, new_h + 20)    # some cross the content border
        cv2.ellipse(m, (int(cx), int(cy)), (int(rng.integers(3, 120)), int(rng.integers(3, 160))), float(rng.uniform(0, 180)), 0, 360, 1, -1)
        ell.append(canvas_of(m))
    sets.append(("ellipses", np.stack(ell)))
    lines = []
    for i in range(8):
        m = np.zeros((new_h, new_w), np.uint8)
        p = rng.integers(0, [new_w, new_h, new_w, new_h])
        cv2.line(m, (int(p[0]), int(p[1])), (int(p[2]), int(p[3])), 1, int(1 + i % 3))
        lines.append(canvas_of(m))
    sets.append(("lines", np.stack(lines)))
    dots = np.zeros((4, new_h, new_w), np.uint8)
    for d in dots:
        d[rng.integers(0, new_h, 40), rng.integers(0, new_w, 40)] = 1
    dots[0, 0, 0] = dots[0, -1, -1] = dots[0, 0, -1] = dots[0, -1, 0] = 1          # the four corners
    sets.append(("dots", np.stack([canvas_of(d) for d in dots])))
    sets.append(("noise", np.stack([canvas_of((rng.random((new_h, new_w)) < p).astype(np.uint8)) for p in (0.3, 0.5, 0.7, 0.9)])))
    sets.append(("full", np.stack([canvas_of(np.ones((new_h, new_w), np.uint8))])))
    return sets


def import_playback(playback: Path):
    sys.path.insert(0, str(playback / "services/redaction"))
    from src.seg_engine import _smooth_mask  # noqa: PLC0415
    from src.trt_engine import _unletterbox_mask  # noqa: PLC0415

    return _unletterbox_mask, _smooth_mask


def cpu_post(stack: np.ndarray, w: int, h: int, unletterbox, smooth) -> np.ndarray:
    """What `TrtSegEngine._collect_with_slot` returns for these kept masks (dilation is off in production)."""
    scale = min(CANVAS / w, CANVAS / h)
    _, _, pad_x, pad_y = letterbox(w, h)
    return np.stack([smooth(unletterbox(m, scale, pad_x, pad_y, (h, w)), SIGMA) for m in stack])


# ------------------------------------------------------------------------------------------------- check
def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["check"])
    p.add_argument("--playback", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    playback = Path(args.playback)
    unletterbox, smooth = import_playback(playback)
    report = {"opencv": cv2.__version__, "numpy": np.__version__}

    k = fixed_weights()
    report["weights"] = {"k": k, "sum": sum(k), "cv2_getGaussianKernel_x256": [round(v * 256, 3) for v in cv2.getGaussianKernel(13, SIGMA).ravel()]}
    print("weights k/256:", k)

    rng = np.random.default_rng(7)
    worst = 0
    for shape in [(416, 768), (480, 640), (576, 768), (31, 17), (13, 13)]:
        for _ in range(4):
            img = rng.integers(0, 256, shape, dtype=np.uint8)
            ref = cv2.GaussianBlur(img, ksize=(0, 0), sigmaX=SIGMA)
            mine = np.floor(blur_exact(img, k) + 0.5).astype(np.int64)
            worst = max(worst, int(np.abs(ref.astype(np.int64) - mine).max()))
    report["blur_random_u8"] = {"images": 20, "max_abs_diff": worst}
    print("blur on random 8-bit images, max |cv2 − exact|:", worst)

    nearest = {}
    for w, h in GEOMETRIES:
        new_w, new_h, pad_x, pad_y = letterbox(w, h)
        rows = np.repeat(np.arange(CANVAS, dtype=np.uint16)[:, None], CANVAS, 1)
        cols = rows.T.copy()
        crop_r = rows[pad_y: pad_y + new_h, pad_x: pad_x + new_w]
        crop_c = cols[pad_y: pad_y + new_h, pad_x: pad_x + new_w]
        got_r = cv2.resize(crop_r, (w, h), interpolation=cv2.INTER_NEAREST)[:, 0].astype(int)
        got_c = cv2.resize(crop_c, (w, h), interpolation=cv2.INTER_NEAREST)[0, :].astype(int)
        want_r = np.arange(h) * new_h // h + pad_y
        want_c = np.arange(w) * new_w // w + pad_x
        nearest[f"{w}x{h}"] = {"letterbox": [new_w, new_h, pad_x, pad_y], "rows_equal": bool((got_r == want_r).all()),
                               "cols_equal": bool((got_c == want_c).all())}
    report["nearest"] = nearest
    print("nearest:", nearest)

    cases, total, differing = [], 0, 0
    for w, h in GEOMETRIES:
        for name, stack in detections(playback / "services/redaction/tests/fixtures", w, h) + stress(w, h, seed=w + h):
            ref = cpu_post(stack, w, h, unletterbox, smooth)
            _, _, pad_x, pad_y = letterbox(w, h)
            new_w, new_h, _, _ = letterbox(w, h)
            mine = np.stack([smooth_exact(m[(np.arange(h) * new_h // h + pad_y)[:, None], (np.arange(w) * new_w // w + pad_x)[None, :]], k)
                             for m in stack])
            diff = int((ref != mine).sum())
            total += ref.size
            differing += diff
            cases.append({"geometry": f"{w}x{h}", "case": name, "detections": int(len(stack)), "pixels": int(ref.size),
                          "covered": int(ref.sum()), "differing": diff})
    report["post"] = {"cases": cases, "pixels": total, "differing": differing}
    print(f"post-processing, Playback's functions vs exact integer re-implementation: {differing} of {total} pixels differ "
          f"over {len(cases)} cases")
    Path(args.out).write_text(json.dumps(report, indent=1) + "\n")
    print(f"→ {args.out}")


if __name__ == "__main__":
    main()
