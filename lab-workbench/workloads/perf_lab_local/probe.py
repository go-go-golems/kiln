"""Read-only capability report for the local host, printed as one JSON object.

The lab server runs this once at startup. Nothing here changes system state.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
from pathlib import Path


def sysctl(name: str) -> str | None:
    try:
        return subprocess.run(["sysctl", "-n", name], capture_output=True, text=True, timeout=5, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def workloads_revision() -> str:
    """Content hash of the workload sources: part of every local experiment's identity."""
    h = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob("*.py")):
        h.update(path.name.encode())
        h.update(path.read_bytes())
    return h.hexdigest()[:12]


def main() -> None:
    import numpy
    import torch

    brand = sysctl("machdep.cpu.brand_string") or platform.processor() or platform.machine()
    perf = sysctl("hw.perflevel0.physicalcpu")
    eff = sysctl("hw.perflevel1.physicalcpu")
    mem = sysctl("hw.memsize")
    mps = bool(torch.backends.mps.is_available())
    report = {
        "host": "local",
        "arch": "arm64" if platform.machine() in ("arm64", "aarch64") else "x86_64",
        "cpu": {
            "name": brand,
            "cores": os.cpu_count() or 0,
            "coreClasses": [c for c, n in (("performance", perf), ("efficiency", eff)) if n and int(n) > 0] or ["unknown"],
            "performanceCores": int(perf) if perf else None,
            "efficiencyCores": int(eff) if eff else None,
        },
        "memoryBytes": int(mem) if mem else None,
        "gpu": {
            "name": f"{brand} GPU (Metal, via MPS)" if mps else "none",
            "count": 1 if mps else 0,
            "precisions": ["fp32", "fp16"] if mps else [],
        },
        "devices": ["cpu", "mps"] if mps else ["cpu"],
        "tools": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "numpy": numpy.__version__,
            "torch.profiler": "yes",
            "torch.compile": "inductor (cpu)",
            "ncu": "unavailable",
            "nsys": "unavailable",
            "workloads": workloads_revision(),
        },
        "threads": torch.get_num_threads(),
        "counters": {"unsupported": ["*"], "reason": "macOS exposes no hardware performance counters without elevated privileges"},
        "synthetic": False,
    }
    print(json.dumps(report))


if __name__ == "__main__":
    main()
