"""Run Playback's Grounding DINO backend at two revisions, paired, on dataset images (ML-PERF-002).

    python -m perf_lab_dino.run --specs baseline.json candidate.json --mode timing --rep 0 \
        --images images.json --repo <playback checkout> --out <dir>

Both arms run in this one process, as the PR's own benchmark does (services/detection/benchmarks/
grounding_dino.py at the candidate revision): the candidate backend loads the model; the baseline backend's
source, read with `git show <rev>:…`, shares its processor and weights through the benchmark's
load_baseline_detector. Requests are timed in a seeded random order per image. Reports follow the
benchmark's JSON schema (detection-qualification/v1) so the lab imports local runs and archived DGX runs
with one importer. Image bytes are verified against the dataset's SHA-256 before use.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
import platform
import random
import resource
import statistics
import subprocess
import sys
import time
from dataclasses import asdict
from pathlib import Path

DETECTION_FILES = [
    "config.py",
    "instance_info.py",
    "cuda_errors.py",
    "detector_base.py",
    "backends/__init__.py",
    "backends/grounding_dino.py",
    "backends/grounding_dino_postprocess.py",
    "backends/grounding_dino_replay.py",
    "backends/grounding_dino_fusion.py",
]
MODEL = "IDEA-Research/grounding-dino-tiny"
MODEL_REVISION = "a2bb814dd30d776dcf7e30523b00659f4f141c71"


def emit(event: str, **fields) -> None:
    print(json.dumps({"event": event, **fields}), flush=True)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_show(repo: str, rev: str, path: str) -> bytes | None:
    r = subprocess.run(["git", "-C", repo, "show", f"{rev}:{path}"], capture_output=True, timeout=30)
    return r.stdout if r.returncode == 0 else None


def materialize(repo: str, rev: str, dest: Path, with_benchmarks: bool) -> dict[str, str]:
    """Writes the detection package (and the benchmark helpers) at `rev`; returns path → SHA-256."""
    written: dict[str, str] = {}
    pkg = dest / "detection"
    for rel in DETECTION_FILES:
        data = git_show(repo, rev, f"services/detection/src/detection/{rel}")
        if data is None:
            continue  # the original revision has no replay, fusion or postprocess module
        target = pkg / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        written[f"detection/{rel}"] = sha256(data)
    # package initialization bypassed (the real __init__ imports the FastAPI service), as in the PR's local checks
    (pkg / "__init__.py").write_text("")
    if with_benchmarks:
        for rel in ["benchmarks/__init__.py", "benchmarks/grounding_dino.py"]:
            data = git_show(repo, rev, f"services/detection/{rel}")
            if data is None:
                raise SystemExit(f"{rev} has no services/detection/{rel}; the candidate must be a revision with the PR's benchmark")
            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
            (dest / rel).write_bytes(data)
            written[rel] = sha256(data)
    if "detection/backends/grounding_dino.py" not in written:
        raise SystemExit(f"{rev} has no services/detection/src/detection/backends/grounding_dino.py")
    return written


def snapshot_dir() -> Path:
    from huggingface_hub import snapshot_download

    try:
        return Path(snapshot_download(MODEL, revision=MODEL_REVISION, local_files_only=True))
    except Exception as e:  # noqa: BLE001 - the message is the instruction
        raise SystemExit(f"model snapshot {MODEL}@{MODEL_REVISION[:12]} is not downloaded ({e}); run: pnpm lab models fetch") from e


def variant_of(spec: dict) -> str:
    return str(((spec.get("comparison") or {}).get("switches") or {}).get("variant") or spec["arm"])


def peak_rss_bytes() -> int:
    r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return r if sys.platform == "darwin" else r * 1024  # macOS reports bytes, Linux kibibytes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--specs", nargs=2, required=True, help="baseline and candidate capture specifications")
    ap.add_argument("--mode", choices=["timing", "predictions"], required=True)
    ap.add_argument("--rep", type=int, required=True)
    ap.add_argument("--images", required=True, help="JSON list of {imageId, fileName, sha256, path}")
    ap.add_argument("--repo", required=True, help="a Playback checkout that has both revisions")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    specs = [json.loads(Path(p).read_text()) for p in args.specs]
    variants = [variant_of(s) for s in specs]
    if sorted(variants) != ["baseline", "candidate"]:
        raise SystemExit(f"expected a baseline and a candidate arm, got {variants}")
    spec = dict(zip(variants, specs))
    wl = spec["candidate"]["workload"]
    if wl != spec["baseline"]["workload"]:
        raise SystemExit("the two arms must declare the same workload (dataset, images, labels, precision, size, thresholds)")
    out = Path(args.out).resolve()
    (out / "reports").mkdir(parents=True, exist_ok=True)
    # pydantic-settings reads a .env from the working directory; run where there is none
    os.chdir(out)

    revs = {v: str((spec[v].get("comparison") or {}).get("arm_revision")) for v in variants}
    t0 = time.perf_counter()
    sources = {
        "candidate": materialize(args.repo, revs["candidate"], out / "src-candidate", with_benchmarks=True),
        "baseline": materialize(args.repo, revs["baseline"], out / "src-baseline", with_benchmarks=False),
    }
    emit("materialized", revisions=revs, files={v: len(f) for v, f in sources.items()})

    sys.path.insert(0, str(out / "src-candidate"))
    import torch  # noqa: E402
    import transformers  # noqa: E402
    from transformers.utils import logging as hf_logging  # noqa: E402

    hf_logging.disable_progress_bar()  # as the PR's benchmark does; the bar floods the stderr the runner keeps

    backend = importlib.import_module("detection.backends.grounding_dino")
    bench = importlib.import_module("benchmarks.grounding_dino")

    labels = list(wl.get("labels") or ["person"])
    precision = str(wl.get("precision") or "fp32")
    detector = backend.GroundingDinoDetector(
        model_path=str(snapshot_dir()),
        input_size=int(wl.get("inputSize") or wl.get("input_size") or 768),
        box_threshold=float(wl.get("boxThreshold") or wl.get("box_threshold") or 0.3),
        text_threshold=float(wl.get("textThreshold") or wl.get("text_threshold") or 0.3),
        use_fp16=precision == "fp16",
    )
    load_start = time.perf_counter()
    if not detector.load_model():
        raise SystemExit("Grounding DINO failed to load")
    load_seconds = time.perf_counter() - load_start
    baseline_src = out / "src-baseline" / "detection" / "backends" / "grounding_dino.py"
    detectors = {"candidate": detector, "baseline": bench.load_baseline_detector(baseline_src, backend, detector)}
    emit("loaded", seconds=round(load_seconds, 2), device=backend._device, threads=torch.get_num_threads())

    images = json.loads(Path(args.images).read_text())
    payloads = []
    for im in images:
        data = Path(im["path"]).read_bytes()
        if sha256(data) != im["sha256"]:
            raise SystemExit(f"image {im['imageId']} does not match its recorded SHA-256")
        payloads.append((im, data))

    collection = spec["candidate"].get("collection") or {}
    warmup = int(((spec["candidate"].get("warmup") or {}).get("requests")) or 1)
    iterations = int(collection.get("pairs") or 2)
    seed = int(((spec["candidate"].get("comparison") or {}).get("paired_order_seed")) or 20261009)
    rng = random.Random(seed + args.rep)

    def call(variant: str, payload: bytes):
        return detectors[variant].detect_with_options(payload, labels, precision=precision)

    results, predictions = [], {}
    for k, (im, payload) in enumerate(payloads):
        if args.mode == "predictions":
            predictions[im["fileName"]] = {v: [asdict(d) for d in call(v, payload)] for v in ("baseline", "candidate")}
        else:
            for v in ("baseline", "candidate"):
                for _ in range(warmup):
                    call(v, payload)
            samples = {"baseline": [], "candidate": []}
            digests = {"baseline": [], "candidate": []}
            for _ in range(iterations):
                order = ["baseline", "candidate"]
                rng.shuffle(order)
                for v in order:
                    start = time.perf_counter()
                    dets = call(v, payload)
                    samples[v].append((time.perf_counter() - start) * 1000)
                    digests[v].append(bench.output_digest(dets))
            results.append(
                {
                    "image": im["fileName"],
                    "payload_sha256": im["sha256"],
                    "latencies_ms": samples,
                    "median_ms": {v: statistics.median(s) for v, s in samples.items()},
                    "exact_paired_outputs": digests["baseline"] == digests["candidate"],
                    "stable_outputs": {v: len(set(d)) == 1 for v, d in digests.items()},
                    "output_digests": digests,
                    "cuda_peak_allocated_bytes": None,
                    "cuda_peak_reserved_bytes": None,
                }
            )
        emit("image", i=k + 1, of=len(payloads), image=im["imageId"])

    replay = getattr(detector, "_replay", None)
    header = {
        "architecture": platform.machine(),
        "gpu": None,
        "torch": torch.__version__,
        "transformers": transformers.__version__,
        "settings": detector.status(),
        "replay": {
            "configured": replay is not None,
            "active": getattr(replay, "graph", None) is not None,
            "disabled": getattr(replay, "disabled", False),
            "disabled_reason": getattr(replay, "disabled_reason", None),
        },
        "precision": precision,
        "labels": labels,
        "jpeg": False,
        "variant": "paired",
        "normalization_helper_present": hasattr(backend, "_normalize_image"),
        "baseline_source_sha256": sha256(baseline_src.read_bytes()),
        "load_seconds": load_seconds,
        "cgroup_peak_memory_bytes": None,
        "process_peak_rss_bytes": peak_rss_bytes(),
        "process_cuda_peak_allocated_bytes": None,
        "process_cuda_peak_reserved_bytes": None,
    }
    if args.mode == "timing":
        (out / "reports" / "paired.json").write_text(json.dumps({**header, "results": results}, indent=1))
    else:
        (out / "reports" / "example-predictions.json").write_text(json.dumps(predictions, indent=1))

    snap = snapshot_dir()
    model_files = []
    for f in sorted(p for p in snap.iterdir() if p.is_file()):
        data = f.read_bytes()
        model_files.append({"file": f.name, "bytes": len(data), "sha256": sha256(data)})
    (out / "artifact-provenance.json").write_text(
        json.dumps(
            {"architecture": platform.machine(), "python": platform.python_version(), "torch": torch.__version__, "transformers": transformers.__version__, "model_snapshot": MODEL_REVISION, "model_files": model_files, "sources": sources},
            indent=1,
        )
    )
    (out / "run-configuration.json").write_text(
        json.dumps({"host": "local", "candidate_revision": revs["candidate"], "baseline_revision": revs["baseline"], "threads": {"torch": torch.get_num_threads()}, "seed": seed + args.rep, "warmup": warmup, "pairs": iterations}, indent=1)
    )
    emit("done", seconds=round(time.perf_counter() - t0, 1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
