#!/usr/bin/env python3
"""C2 timing figure (KILN-002): time per frame against the number of masks, for the separable and direct W-28 forms
(wgpu on the M1 Pro, dispatch + wait) and Playback's CPU loop, one panel per geometry.

  mask-post-timing-figure.py --time various/c2/kiln-time-m1pro.json --out PNG
"""
import argparse
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--time", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    rows = json.load(open(args.time))["rows"]
    geometries = sorted({r["geometry"] for r in rows}, key=lambda g: ["768x416", "640x480", "768x576"].index(g))
    fig, axes = plt.subplots(1, len(geometries), figsize=(4.4 * len(geometries), 3.8), sharey=True)
    for ax, g in zip(axes, geometries):
        for form, style in (("separable", "-o"), ("direct", "-s")):
            pts = sorted((r["bucket"], r["gpuMs"]) for r in rows if r["geometry"] == g and r["form"] == form)
            ax.plot(*zip(*pts), style, label=f"Kiln {form} (wgpu)", markersize=4)
        cpu = sorted({r["bucket"]: r["cpuMs"] for r in rows if r["geometry"] == g and r["form"] == "separable"}.items())
        ax.plot(*zip(*cpu), "--^", color="0.35", label="Playback CPU loop", markersize=4)
        ax.set_xscale("log", base=2)
        ax.set_yscale("log")
        ax.set_xticks([1, 2, 4, 8, 16, 32, 64, 100], ["1", "2", "4", "8", "16", "32", "64", "100"])
        ax.set_title(g)
        ax.set_xlabel("masks per frame (bucket)")
        ax.grid(True, which="both", alpha=0.25)
    axes[0].set_ylabel("ms per frame (median of 15)")
    axes[0].legend(fontsize=8, loc="upper left")
    fig.suptitle("W-28 mask post-processing on an M1 Pro: Kiln kernels vs Playback's CPU loop", fontsize=11)
    fig.tight_layout()
    fig.savefig(args.out, dpi=130)
    print(f"→ {args.out}")


if __name__ == "__main__":
    main()
