#!/usr/bin/env python3
"""B1 (KILN-002, guide §13): where the time of a zone-motion run goes on this machine.

Run with the factory-videos venv and its src on PYTHONPATH (and DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib on macOS
for GStreamer):

  motion-split.py runs   --fv DIR --out JSON [--reps 4] [--seed 1] [--variants default,gst480,vc4]
                                                                     whole `factory run`s of a motion-only script on
                                                                     both golden clips, one fresh worker process each,
                                                                     in seeded order per rep: default; gst480 =
                                                                     analysisMaxWidth 480 (GStreamer scales); vcN =
                                                                     videoconvert on N threads; a "+free" suffix replaces
                                                                     to_gray by a zero image (the oracle: grey costs
                                                                     nothing); patches in b1-site/sitecustomize.py;
                                                                     per-node lane service times, source fps, worker CPU
  motion-split.py decode --out JSON [--reps 3]                       the file source alone: decode + videoconvert of
                                                                     every frame, full size and scaled to 480
  motion-split.py gray   --out JSON [--passes 5]                     to_gray alone on the 300 selected frames of each
                                                                     clip: cv2.cvtColor ms, Pillow resize ms, both
"""
from __future__ import annotations

import argparse
import json
import os
import random
import resource
import statistics
import tempfile
import time
from pathlib import Path

CLIPS = Path("/Volumes/SSD/data/factory-shots/golden-clips/v1")
SCRIPT = "output('motion', input('video').motion(input('zones'), {everyMs: 250, windowMs: 5000}));\n"
EVERY_US = 250_000


def median(xs):
    return statistics.median(xs) if xs else None


def child_cpu_s() -> float:
    r = resource.getrusage(resource.RUSAGE_CHILDREN)
    return r.ru_utime + r.ru_stime


def one_run(fv: Path, side: str, variant: str, work: Path) -> dict:
    from factory.application.runs import offline_run

    bindings = {"video": {"kind": "source", "path": str(CLIPS / f"marker-short-{side}.mp4")},
                "zones": {"kind": "zones", "path": str(fv / f"js-examples/guide/golden/zones/marker-short-{side}-zones.json")}}
    execution = {"analysisMaxWidth": 480} if variant.startswith("gst480") else None
    script = work / "motion.js"
    script.write_text(SCRIPT)
    out = Path(tempfile.mkdtemp(dir=work)) / "run"
    saved = dict(os.environ)
    base, _, free = variant.partition("+")
    if base.startswith("vc") or free:      # the worker inherits this process's environment (runs._worker_env)
        if base.startswith("vc"):
            os.environ["B1_VIDEOCONVERT_THREADS"] = base[2:]
        if free == "free":
            os.environ["B1_FREE_GRAY"] = "1"
        os.environ["PYTHONPATH"] = os.pathsep.join([str(Path(__file__).resolve().parent / "b1-site"),
                                                    os.environ.get("PYTHONPATH", "")])
    try:
        cpu0, t0 = child_cpu_s(), time.perf_counter()
        result = offline_run(script, bindings, out, execution=execution, target="mac")
        wall, cpu = time.perf_counter() - t0, child_cpu_s() - cpu0
    finally:
        os.environ.clear()
        os.environ.update(saved)
    if result["exit"] != 0 or result["status"] != "complete":
        raise SystemExit(f"run failed: {result}")
    status = json.loads((out / "run/status.json").read_text())
    phases = json.loads((out / "run/phases.json").read_text())["marksMs"]
    receipt = json.loads((out / "run/run.json").read_text())
    ops = {t["node"]: t["op"] for t in receipt["executionPlan"]["tasks"]}
    nodes = {}
    for node, s in status["lane"]["perNode"].items():
        d = s["serviceMs"]
        nodes[ops.get(node, node)] = {"node": node, "n": d["n"], "p50": d["p50"], "p95": d["p95"], "max": d["max"],
                                      "approxTotalMs": round(d["p50"] * d["n"], 1)}
    return {"side": side, "variant": variant, "wallS": round(wall, 3), "workerCpuS": round(cpu, 3),
            "sessionS": round((phases["sessionEnded"] - phases["anchored"]) / 1000, 3),
            "startupS": round(phases["anchored"] / 1000, 3),
            "framesDecoded": status["source"]["framesDecoded"], "decodeFps": status["source"]["fps"],
            "adapter": status["anchor"]["adapter"], "decoded": f'{status["anchor"]["width"]}x{status["anchor"]["height"]}',
            "nodes": nodes}


def cmd_runs(args) -> dict:
    fv = Path(args.fv).resolve()
    rng = random.Random(args.seed)
    rows = []
    with tempfile.TemporaryDirectory(dir="/Volumes/SSD/tmp") as tmp:
        for rep in range(args.reps):
            for side in ("left", "right"):
                order = list(args.variants)
                rng.shuffle(order)
                for variant in order:
                    row = one_run(fv, side, variant, Path(tmp))
                    row["rep"] = rep
                    rows.append(row)
                    g = row["nodes"].get("motion.gray", {})
                    print(f"rep {rep} {side:5} {variant:7} wall {row['wallS']:6.2f} s session {row['sessionS']:6.2f} s "
                          f"cpu {row['workerCpuS']:6.2f} s decode {row['decodeFps']:6.1f} fps  "
                          f"gray p50 {g.get('p50')} ms × {g.get('n')}", flush=True)
    summary = {}
    for side in ("left", "right"):
        for variant in args.variants:
            rs = [r for r in rows if r["side"] == side and r["variant"] == variant]
            gray = [r["nodes"]["motion.gray"]["approxTotalMs"] / 1000 for r in rs]
            session = [r["sessionS"] for r in rs]
            summary[f"{side}/{variant}"] = {
                "wallS": median([r["wallS"] for r in rs]), "sessionS": median(session),
                "workerCpuS": median([r["workerCpuS"] for r in rs]), "decodeFps": median([r["decodeFps"] for r in rs]),
                "grayP50Ms": median([r["nodes"]["motion.gray"]["p50"] for r in rs]),
                "changeP50Ms": median([r["nodes"]["motion.change"]["p50"] for r in rs]),
                "grayApproxS": median(gray),
                "grayShareOfSession": round(median([g / s for g, s in zip(gray, session)]), 4),
            }
    return {"mode": "runs", "seed": args.seed, "reps": args.reps, "variants": args.variants, "rows": rows,
            "summary": summary}


def frames(side: str, max_width: int | None):
    """Every decoded frame of a golden clip as (source_us, array view, release)."""
    from factory.backends.media.file import FileSource
    from factory.core.media import FrameEvent
    from factory.core.plan import SourceSpec
    from factory.runtime.resources import HostPixelStore

    spec = SourceSpec(name="video", kind="file", source_key="b1", path=str(CLIPS / f"marker-short-{side}.mp4"),
                      analysis_max_width=max_width)
    pixels = HostPixelStore(256 << 20)
    session = FileSource(target="mac").open(spec, pixels)
    for event in session.events():
        if isinstance(event, FrameEvent):
            yield event.source_us, pixels.get(event.buffer), lambda h=event.buffer: pixels.release(h)


def cmd_decode(args) -> dict:
    rows = []
    for rep in range(args.reps):
        for side in ("left", "right"):
            for max_width in (None, 480):
                t0, n = time.perf_counter(), 0
                for _, _, release in frames(side, max_width):
                    n += 1
                    release()
                s = time.perf_counter() - t0
                rows.append({"rep": rep, "side": side, "maxWidth": max_width, "frames": n, "s": round(s, 3),
                             "fps": round(n / s, 1), "msPerFrame": round(1000 * s / n, 3)})
                print(json.dumps(rows[-1]), flush=True)
    return {"mode": "decode", "rows": rows}


def cmd_gray(args) -> dict:
    import cv2
    import numpy as np
    from PIL import Image

    from factory.kernels.motion import to_gray

    out = {"mode": "gray", "passes": args.passes, "cv2": cv2.__version__, "pillow": Image.__version__,
           "threads": cv2.getNumThreads(), "clips": {}}
    for side in ("left", "right"):
        selected, bucket = [], None
        for us, array, release in frames(side, None):
            if us // EVERY_US != bucket:
                bucket = us // EVERY_US
                selected.append(np.array(array))
            release()
        cvt, pil, both = [], [], []
        for _ in range(args.passes):
            for rgb in selected:
                t0 = time.perf_counter_ns()
                g = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2GRAY)
                t1 = time.perf_counter_ns()
                np.asarray(Image.fromarray(g).resize((480, 270), Image.BICUBIC))
                t2 = time.perf_counter_ns()
                to_gray(rgb, 480, 270)
                t3 = time.perf_counter_ns()
                cvt.append((t1 - t0) / 1e6)
                pil.append((t2 - t1) / 1e6)
                both.append((t3 - t2) / 1e6)
        out["clips"][side] = {"frames": len(selected), "shape": list(selected[0].shape),
                              "cvtColorMs": {"p50": round(median(cvt), 3), "mean": round(statistics.fmean(cvt), 3)},
                              "pillowResizeMs": {"p50": round(median(pil), 3), "mean": round(statistics.fmean(pil), 3)},
                              "toGrayMs": {"p50": round(median(both), 3), "mean": round(statistics.fmean(both), 3)}}
        print(side, json.dumps(out["clips"][side]), flush=True)
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["runs", "decode", "gray"])
    p.add_argument("--fv")
    p.add_argument("--out", required=True)
    p.add_argument("--reps", type=int, default=4)
    p.add_argument("--passes", type=int, default=5)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--variants", type=lambda v: v.split(","), default=["default", "gst480"])
    args = p.parse_args()
    import platform

    result = {"host": platform.platform(), "machine": platform.machine(), "python": platform.python_version(),
              **{"runs": cmd_runs, "decode": cmd_decode, "gray": cmd_gray}[args.mode](args)}
    Path(args.out).write_text(json.dumps(result, indent=1) + "\n")
    print(f"→ {args.out}")


if __name__ == "__main__":
    main()
