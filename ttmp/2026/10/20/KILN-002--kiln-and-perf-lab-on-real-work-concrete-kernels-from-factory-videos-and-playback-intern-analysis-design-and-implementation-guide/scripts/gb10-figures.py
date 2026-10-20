#!/usr/bin/env python3
"""GB10 figures for KILN-002 (Steps 9–12). Charts only; no camera content.

  gb10-figures.py timing --time LABEL=mask-post-cuda-time.json [--time LABEL=…] --out PNG
      ms per frame against masks per frame, one panel per geometry: run + copy and the CPU loop, per host
  gb10-figures.py spec --check gb10-spec-check.json [--check gb10-spec-check-rtx5090.json] --out PNG
      each kernel's modelled time against the runner's median, under the gb10 spec and each check's other spec
  gb10-figures.py schedules --check … [--check …] --out PNG
      per kernel, the runner's median for each spec's schedule, relative to the fastest of them
"""
import argparse
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

GEOMETRIES = ["768x416", "640x480", "768x576"]
TICKS = [1, 2, 4, 8, 16, 32, 64, 100]


def timing(args):
    runs = [(label, json.load(open(path))) for label, path in (t.split("=", 1) for t in args.time)]
    fig, axes = plt.subplots(1, len(GEOMETRIES), figsize=(4.4 * len(GEOMETRIES), 3.9), sharey=True)
    markers = ["o", "s", "D"]
    for ax, g in zip(axes, GEOMETRIES):
        for (label, run), m in zip(runs, markers):
            rows = sorted((r for r in run["rows"] if r["geometry"] == g), key=lambda r: r["masks"])
            x = [r["masks"] for r in rows]
            ax.plot(x, [r["gpu_ms"] for r in rows], "-" + m, markersize=4, label=f"kiln, run + copy ({label})")
            ax.plot(x, [r["cpu_ms"] for r in rows], "--" + m, markersize=4, color="0.4" if m == "o" else "0.65",
                    label=f"CPU loop ({label})")
        ax.set_xscale("log", base=2)
        ax.set_yscale("log")
        ax.set_xticks(TICKS, [str(t) for t in TICKS])
        ax.set_title(g)
        ax.set_xlabel("masks per frame")
        ax.grid(True, which="both", alpha=0.25)
    axes[0].set_ylabel("ms per frame (median of 15)")
    axes[0].legend(fontsize=7, loc="upper left")
    fig.suptitle("REDACTION_MASK_POST=kiln against the CPU loop on a GB10 (redaction image, NVRTC 13.2)", fontsize=11)
    fig.tight_layout()
    fig.savefig(args.out, dpi=130)
    print(f"→ {args.out}")


TITLES = {
    "gb10": "gb10 spec (measured: 259 GB/s, 28.9 TFLOP/s, 48 SMs)",
    "fallback": "fallback: RTX 5090 figures, 48 SMs",
    "rtx5090": "rtx5090: RTX 5090 spec, 170 SMs",
}


def load_checks(paths):
    """[(spec id, rows)] for gb10 and each check's other spec; the gb10 rows are the same in every check."""
    checks = [json.load(open(p)) for p in paths]
    out = [("gb10", [r["gb10"] | {"preset": r["preset"]} for r in checks[0]["rows"]])]
    for c in checks:
        out.append((c.get("other", "fallback"), [r["fallback"] | {"preset": r["preset"]} for r in c["rows"]]))
    return out, checks[0]["rows"]


def spec(args):
    specs, _ = load_checks(args.check)
    fig, axes = plt.subplots(1, len(specs), figsize=(4.6 * len(specs), 4.4), sharex=True, sharey=True)
    for ax, (s, rows) in zip(axes, specs):
        for preset, m, c in (("W-26", "o", "C0"), ("W-28", "s", "C3")):
            pts = [(r["measuredUs"], r["modelUs"]) for r in rows if r["preset"] == preset]
            ax.scatter(*zip(*pts), marker=m, s=22, color=c, label=preset)
        ax.plot([5, 5e5], [5, 5e5], color="0.5", lw=0.8)
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_title(TITLES.get(s, s), fontsize=9)
        ax.set_xlabel("measured on the GB10, µs (runner median)")
        ax.grid(True, which="both", alpha=0.25)
    axes[0].set_ylabel("Kiln's model, µs")
    axes[0].legend(fontsize=8, loc="upper left")
    fig.suptitle("Modelled against measured kernel time, 18 kernels on bling (diagonal: model = measurement)", fontsize=11)
    fig.tight_layout()
    fig.savefig(args.out, dpi=130)
    print(f"→ {args.out}")


def schedules(args):
    specs, rows = load_checks(args.check)
    labels = [f"{r['preset']} {' '.join(str(v) for v in r['pins'].values())} {r['kernel']}" for r in rows]
    best = [min(rs[i]["measuredUs"] for _, rs in specs) for i in range(len(rows))]
    fig, ax = plt.subplots(figsize=(11, 5.2))
    w = 0.8 / len(specs)
    for k, (s, rs) in enumerate(specs):
        ys = [r["measuredUs"] / b for r, b in zip(rs, best)]
        ax.bar([i + (k - (len(specs) - 1) / 2) * w for i in range(len(rows))], ys, w, label=TITLES.get(s, s))
    ax.set_yscale("log")
    ax.axhline(1, color="0.3", lw=0.8)
    ax.set_xticks(range(len(rows)), labels, rotation=60, ha="right", fontsize=7)
    ax.set_ylabel("runner median / fastest of the three")
    ax.grid(True, axis="y", which="both", alpha=0.25)
    ax.legend(fontsize=8, loc="upper left")
    ax.set_title("The schedule each spec chose, timed on the GB10 (bling, idle); 1 = fastest", fontsize=11)
    fig.tight_layout()
    fig.savefig(args.out, dpi=130)
    print(f"→ {args.out}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("timing")
    t.add_argument("--time", action="append", required=True)
    t.add_argument("--out", required=True)
    for name in ("spec", "schedules"):
        s = sub.add_parser(name)
        s.add_argument("--check", action="append", required=True)
        s.add_argument("--out", required=True)
    args = p.parse_args()
    {"timing": timing, "spec": spec, "schedules": schedules}[args.cmd](args)


if __name__ == "__main__":
    main()
