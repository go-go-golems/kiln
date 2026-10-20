#!/usr/bin/env python3
"""B1 (KILN-002, guide §13): the verdict on gray-is-worth-a-kernel from motion-split.py's outputs, and a figure.

  b1-verdict.py --dir various/b1 [--figure various/screenshots/b1-motion-split-m1pro.png]

Reads runs-m1pro.json, runs-vc4-m1pro.json, runs-oracle-m1pro.json, gray-m1pro.json, decode-m1pro.json and
gst-split-m1pro.jsonl; writes verdict.json next to them. The figure needs matplotlib (the factory-videos venv has it).
"""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path


def load(d: Path, name: str):
    return json.loads((d / name).read_text())


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dir", required=True)
    p.add_argument("--figure")
    args = p.parse_args()
    d = Path(args.dir)
    runs, vc4, oracle, gray = (load(d, f) for f in ("runs-m1pro.json", "runs-vc4-m1pro.json", "runs-oracle-m1pro.json",
                                                    "gray-m1pro.json"))
    gst = [json.loads(line) for line in (d / "gst-split-m1pro.jsonl").read_text().splitlines()]
    stage = {s: statistics.median(r["s"] for r in gst if r["stage"] == s) for s in dict.fromkeys(r["stage"] for r in gst)}

    rows = []
    for side in ("left", "right"):
        o = oracle["summary"]
        rows.append({
            "clip": f"marker-short-{side}",
            "sessionS": runs["summary"][f"{side}/default"]["sessionS"],
            "grayLaneS": runs["summary"][f"{side}/default"]["grayApproxS"],
            "grayShare": runs["summary"][f"{side}/default"]["grayShareOfSession"],
            "oracle": {v: o[f"{side}/{v}"]["sessionS"] for v in ("default", "default+free", "vc4", "vc4+free")},
            "freeGraySaves": {base: round(1 - o[f"{side}/{base}+free"]["sessionS"] / o[f"{side}/{base}"]["sessionS"], 4)
                              for base in ("default", "vc4")},
            "vc4": {"sessionS": vc4["summary"][f"{side}/vc4"]["sessionS"],
                    "grayShare": vc4["summary"][f"{side}/vc4"]["grayShareOfSession"],
                    "speedup": round(vc4["summary"][f"{side}/default"]["sessionS"] / vc4["summary"][f"{side}/vc4"]["sessionS"], 3)},
        })
    verdict = {
        "gray-is-worth-a-kernel": {
            "statement": "motion.gray is at least 20 % of the run's wall time on the Mac (guide §13)",
            "rule": "sum of motion.gray lane service time (p50 × n) / session time ≥ 0.2, on both golden clips, default configuration",
            "rows": rows,
            "verdict": "supported" if all(r["grayShare"] >= 0.2 for r in rows) else "refuted",
            "oracle": "a zero-cost to_gray changes the default session by "
                      + ", ".join(f"{-100 * r['freeGraySaves']['default']:+.1f} %" for r in rows)
                      + "; with videoconvert on 4 threads it saves "
                      + ", ".join(f"{100 * r['freeGraySaves']['vc4']:.1f} %" for r in rows)
                      + " (upper bounds for any grey kernel: no upload, dispatch or read-back)",
        },
        "stages": {
            "toGrayMsPerFrame": {s: gray["clips"][s]["toGrayMs"]["p50"] for s in ("left", "right")},
            "cvtColorMsPerFrame": {s: gray["clips"][s]["cvtColorMs"]["p50"] for s in ("left", "right")},
            "pillowResizeMsPerFrame": {s: gray["clips"][s]["pillowResizeMs"]["p50"] for s in ("left", "right")},
            "gstLaunchSecondsPer2250Frames": stage,
        },
    }
    (d / "verdict.json").write_text(json.dumps(verdict, indent=1) + "\n")
    print(json.dumps(verdict["gray-is-worth-a-kernel"], indent=1))

    if args.figure:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, (a, b) = plt.subplots(1, 2, figsize=(12, 4.2), gridspec_kw={"width_ratios": [1.05, 1]})
        frames = 2250
        dec = stage["decode"]
        g = statistics.fmean(gray["clips"][s]["toGrayMs"]["p50"] for s in ("left", "right"))
        bars = [("VideoToolbox decode", dec * 1000 / frames, "#8a8f98"),
                ("videoconvert → RGB\n(1 thread)", (stage["decode+videoconvert RGB"] - dec) * 1000 / frames, "#233d57"),
                ("videoconvert → RGB\n(4 threads)", (stage["decode+videoconvert RGB n-threads=4"] - dec) * 1000 / frames,
                 "#8a8f98"),
                ("to_gray (per selected\nframe, 1 in 7.5)", g, "#c8a45a")][::-1]
        ys = range(len(bars))
        a.barh(list(ys), [v for _, v, _ in bars], color=[c for _, _, c in bars])
        a.set_yticks(list(ys), [n for n, _, _ in bars])
        for y, (_, v, _) in zip(ys, bars):
            a.text(v + 0.08, y, f"{v:.2f} ms", va="center", fontsize=9)
        a.set_xlabel("ms per frame (marker-short-left, 1920×1080, M1 Pro)")
        a.set_title("Where a frame's time goes", fontsize=11, loc="left")
        a.spines[["top", "right"]].set_visible(False)

        labels = ["default", "default\ngrey free", "videoconvert\n4 threads", "4 threads\ngrey free"]
        keys = ["default", "default+free", "vc4", "vc4+free"]
        x = range(len(keys))
        for k, (side, off) in enumerate((("left", -0.2), ("right", 0.2))):
            ys = [oracle["summary"][f"{side}/{key}"]["sessionS"] for key in keys]
            bars = b.bar([i + off for i in x], ys, 0.38, label=f"marker-short-{side}", color=["#233d57", "#8a8f98"][k])
            for bar, y in zip(bars, ys):
                b.text(bar.get_x() + bar.get_width() / 2, y + 0.15, f"{y:.2f}", ha="center", fontsize=8)
        b.set_xticks(list(x), labels, fontsize=9)
        b.set_ylabel("session seconds (75 s clip, median of 4)")
        b.set_title("Whole motion run: what if grey cost nothing?", fontsize=11, loc="left")
        b.legend(frameon=False, fontsize=9)
        b.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        fig.savefig(args.figure, dpi=150)
        print(f"→ {args.figure}")


if __name__ == "__main__":
    main()
