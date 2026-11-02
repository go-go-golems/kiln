#!/usr/bin/env python3
"""Download pinned PassNet shards, verify published LFS SHA256, resume valid files."""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "sources"
revision = json.loads((root / "dataset-revision.json").read_text())["sha"]
files = json.loads((root / "dataset-files.json").read_text())
out = root / "dataset"
out.mkdir(exist_ok=True)
receipts = []
for entry in files:
    name = Path(entry["path"]).name
    target = out / name
    expected = entry["lfs"]["oid"]
    def digest(path):
        h = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
                h.update(block)
        return h.hexdigest()
    if not target.exists() or digest(target) != expected:
        partial = target.with_suffix(".partial")
        url = f"https://huggingface.co/datasets/PassNet/PassNet/resolve/{revision}/{entry['path']}"
        subprocess.run(["curl", "-fL", "--retry", "3", "--connect-timeout", "30", "--max-time", "1800", "-o", str(partial), url], check=True)
        if partial.stat().st_size != entry["size"] or digest(partial) != expected:
            raise ValueError(f"Integrity mismatch: {name}")
        partial.rename(target)
    receipts.append({"file": name, "size": target.stat().st_size, "sha256": expected, "revision": revision})
    (root / "dataset-download-receipt.json").write_text(json.dumps(receipts, indent=2) + "\n")
    print(f"verified {name}", flush=True)
