"""Run one repetition (one process) of one capture of the ``sampler`` workload.

    python -m perf_lab_local.run --spec spec.json --rep 0 --out rep-0

The specification is the lowered capture the workbench produced (spec §5); this script reads only
plan-time values from it. Progress goes to stdout as one JSON object per line; results go to --out.
Nothing is measured outside the declared boundary, and nothing missing is written as zero.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import resource
import subprocess
import sys
import time
from pathlib import Path


def emit(event: str, **fields) -> None:
    print(json.dumps({"event": event, **fields}), flush=True)


def write(out: Path, name: str, data) -> None:
    (out / name).write_text(json.dumps(data, indent=1))


def git_revision() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5, cwd=Path(__file__).parent, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def source_sha256() -> str:
    h = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob("*.py")):
        h.update(path.read_bytes())
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--rep", type=int, required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    spec = json.loads(Path(args.spec).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    wl = spec.get("workload") or {}
    comparison = spec.get("comparison") or {}
    collection = spec.get("collection") or {}
    state = spec.get("state") or {}
    mode = collection.get("mode", "timing")
    impl = str((comparison.get("switches") or {}).get("impl", "unfused"))

    # compiler cache state is part of the experiment: 'fresh' compiles from scratch in this process
    if state.get("compilerCache") == "fresh":
        os.environ["TORCHINDUCTOR_CACHE_DIR"] = str(out / "inductor-cache")
    elif os.environ.get("PERF_LAB_INDUCTOR_CACHE"):
        os.environ["TORCHINDUCTOR_CACHE_DIR"] = os.environ["PERF_LAB_INDUCTOR_CACHE"]

    import numpy
    import torch
    from torch.profiler import ProfilerActivity, profile, record_function

    from .sampler import EAGER, make_inputs, plain, shape_from, tensor_entry

    device = str(wl.get("device", "cpu"))
    dtype_name = str(wl.get("dtype", "float32"))
    dtype = getattr(torch, dtype_name)
    if wl.get("threads"):
        torch.set_num_threads(int(wl["threads"]))
    shape = shape_from(wl)
    warm_n = int((spec.get("warmup") or {}).get("requests") or 4)
    until = (spec.get("warmup") or {}).get("until") or {}
    default_requests = {"timing": 32, "cpu": 32, "trace": 6, "memory": 3}.get(mode, 8)
    n_req = int(collection.get("requests") or wl.get("requests") or default_requests)
    fixture_seed = int(wl.get("seed", 20261012))
    sync = (lambda: torch.mps.synchronize()) if device == "mps" else (lambda: None)

    manifest = {
        "spec_sha256": hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest(),
        "experiment": spec.get("experiment_id"),
        "arm": spec.get("arm"),
        "mode": mode,
        "rep": args.rep,
        "impl": impl,
        "device": device,
        "dtype": dtype_name,
        "threads": torch.get_num_threads(),
        "shape": shape.__dict__,
        "intermediate_numel": shape.intermediate_numel(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "numpy": numpy.__version__,
        "platform": platform.platform(),
        "git_revision": git_revision(),
        "workload_sha256": source_sha256(),
        "boundary": wl.get("boundary") or "sampler_output",
        "pid": os.getpid(),
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "inductor_cache": os.environ.get("TORCHINDUCTOR_CACHE_DIR", "default"),
    }
    write(out, "manifest.json", manifest)
    emit("start", mode=mode, impl=impl, device=device, requests=n_req)

    # ── implementation and its activation, measured from what actually runs ───────────────
    activation = {"impl": impl, "executed": impl, "intermediate": "materialized" if impl == "unfused" else "not materialized" if impl == "gather" else "unknown"}
    compile_ms = None
    if impl == "compiled":
        compiled = torch.compile(plain)
        state_ref = {"fn": compiled}

        def fn(v, g, w, ledger=None):
            try:
                with record_function("compiled_forward"):
                    return state_ref["fn"](v, g, w)
            except Exception as exc:  # inductor failure: fall back, and say so
                activation.update(executed="unfused", compile="inactive", reason=f"{type(exc).__name__}: {str(exc)[:300]}")
                state_ref["fn"] = plain
                return plain(v, g, w)
    elif impl in EAGER:
        eager = EAGER[impl]

        def fn(v, g, w, ledger=None):
            return eager(v, g, w, ledger)
    else:
        emit("error", message=f"unknown impl {impl!r}")
        return 2

    pool = [make_inputs(shape, fixture_seed + k, device, dtype) for k in range(min(8, max(n_req, 1)))]

    # ── warmup until the declared activation holds (bounded) ────────────────────────────────
    def satisfied() -> bool:
        return all(activation.get(k) == v for k, v in until.items())

    i = 0
    while i < warm_n or (until and not satisfied() and i < warm_n + 16):
        t0 = time.perf_counter_ns()
        fn(*pool[i % len(pool)])
        sync()
        ms = (time.perf_counter_ns() - t0) / 1e6
        if impl == "compiled" and i == 0:
            compile_ms = ms
            activation.setdefault("compile", "active")
        emit("warmup", i=i, ms=round(ms, 3))
        i += 1
    if impl == "compiled":
        activation["compileMs"] = round(compile_ms or 0, 1)
    activation["warmupRequests"] = i
    activation["untilSatisfied"] = satisfied() if until else None
    write(out, "activation.json", activation)

    # ── quality gate: same function as the reference implementation on separate inputs ──────
    gv, gg, gw = make_inputs(shape, fixture_seed - 1, device, dtype)
    ref = EAGER["unfused"](gv, gg, gw)
    got = fn(gv, gg, gw)
    sync()
    diff = float((ref.float() - got.float()).abs().max())
    tol = 1e-2 if dtype_name in ("float16", "bfloat16") else 1e-5
    write(out, "quality.json", {"reference": "unfused (eager grid_sample)", "maxAbsDiff": diff, "tolerance": tol, "pass": diff <= tol})

    # ── measured window ─────────────────────────────────────────────────────────────────────
    window_start = time.perf_counter_ns()
    if mode in ("timing", "cpu"):
        ru0 = resource.getrusage(resource.RUSAGE_SELF)
        reqs = []
        for i in range(n_req):
            v, g, w = pool[i % len(pool)]
            c0 = time.thread_time_ns()
            t0 = time.perf_counter_ns()
            fn(v, g, w)
            sync()
            t1 = time.perf_counter_ns()
            reqs.append({"i": i, "start_ns": t0 - window_start, "end_ns": t1 - window_start, "cpu_ns": time.thread_time_ns() - c0})
            emit("request", i=i, ms=round((t1 - t0) / 1e6, 3))
        ru1 = resource.getrusage(resource.RUSAGE_SELF)
        write(out, "timing.json", {"boundary": manifest["boundary"], "requests": reqs, "clock": "time.perf_counter_ns", "cpu_clock": "time.thread_time_ns (calling thread only)"})
        if mode == "cpu":
            fields = ["ru_utime", "ru_stime", "ru_nvcsw", "ru_nivcsw", "ru_minflt", "ru_majflt", "ru_inblock", "ru_oublock"]
            write(out, "cpu.json", {
                "window_ns": time.perf_counter_ns() - window_start,
                "delta": {f: getattr(ru1, f) - getattr(ru0, f) for f in fields},
                "maxrss_bytes": ru1.ru_maxrss if sys.platform == "darwin" else ru1.ru_maxrss * 1024,
                "scope": "process (all threads) over the measured window",
            })
    elif mode in ("trace", "memory"):
        ledger: list = []
        with profile(activities=[ProfilerActivity.CPU], record_shapes=True, profile_memory=(mode == "memory")) as prof:
            for i in range(n_req):
                v, g, w = pool[i % len(pool)]
                with record_function(f"request#{i}"):
                    fn(v, g, w, ledger if (mode == "memory" and i == 0) else None)
                    with record_function("sync"):
                        sync()
                emit("request", i=i)
        prof.export_chrome_trace(str(out / "trace.json"))
        if mode == "memory":
            v, g, w = pool[0]
            inputs = [tensor_entry("value", "encoder.value", v, "request input"), tensor_entry("sampling_locations", "encoder.sampling_locations", g, "request input"),
                      tensor_entry("attention_weights", "encoder.attention_weights", w, "request input")]
            write(out, "memory.json", {"ledger": inputs + ledger, "device": device, "allocator": "c10 CPU allocator (profile_memory)" if device == "cpu" else "MPS (allocations not visible to torch.profiler)"})
    else:
        emit("error", message=f"mode {mode!r} is not supported on host local")
        return 3

    emit("done", window_ms=round((time.perf_counter_ns() - window_start) / 1e6, 2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
