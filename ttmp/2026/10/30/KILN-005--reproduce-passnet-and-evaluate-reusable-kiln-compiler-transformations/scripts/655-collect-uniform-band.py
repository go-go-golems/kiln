"""Collect one terminal uniform PassBench band and audit every declared graph."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


TICKET = Path(__file__).resolve().parent.parent
STUDY = TICKET / "sources/uniform-importable-qualification-v1"
REMOTE = "manuel@bling:/home/manuel/passnet-kiln/KILN-005/sources/uniform-importable-qualification-v1/"
RSH = "ssh -o HostKeyAlias=bling.local"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("band", choices=("pending-ordinary", "pending-large", "regression"))
    args = parser.parse_args()
    destination = STUDY / args.band
    audit = STUDY / f"{args.band}-audit.json"
    archive = STUDY / f"{args.band}-raw.tar.gz"
    receipt = STUDY / f"{args.band}-collection.json"
    if any(p.exists() for p in (destination, audit, archive, receipt)):
        parser.error("collection already exists; preserve prior evidence")
    subprocess.run(["rsync", "-a", "-e", RSH, REMOTE + args.band + "/", str(destination) + "/"], check=True)
    run = json.loads((destination / "run.json").read_text())
    plan = json.loads((STUDY / f"{args.band}-plan.json").read_text())
    staging = json.loads((STUDY / "staging.json").read_text())
    if run["status"] != "complete" or run["plan"] != plan:
        raise RuntimeError("collected band is incomplete or differs from frozen plan")
    if run["source_snapshot"]["sha256"] != staging["source_snapshot"]["sha256"]:
        raise RuntimeError("collected band source snapshot differs from staging")
    subprocess.run(["python3", "integrations/passnet/summarize_task_run.py",
                    "--directory", str(destination), "--upstream", str(TICKET / "sources/upstream"),
                    "--output", str(audit)], check=True)
    result = json.loads(audit.read_text())
    if result["tasks_expected"] != len(plan["tasks"]) or result["graphs_expected"] != sum(t["graphs"] for t in plan["tasks"]):
        raise RuntimeError("auditor membership disagrees with frozen plan")
    subprocess.run(["tar", "-czf", str(archive), "-C", str(STUDY), args.band], check=True)
    record = {"format": "kiln-uniform-band-collection/1", "band": args.band,
              "source_revision": staging["source_revision"], "source_snapshot_sha256": run["source_snapshot"]["sha256"],
              "tasks_expected": result["tasks_expected"], "graphs_expected": result["graphs_expected"],
              "tasks_nominal_accepted": result["tasks_nominal_accepted"],
              "graphs_nominal_accepted": result["graphs_nominal_accepted"],
              "unexecuted_graphs": result["unexecuted_graphs"],
              "audit_sha256": hashlib.sha256(audit.read_bytes()).hexdigest(),
              "archive": archive.name, "archive_bytes": archive.stat().st_size,
              "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
    receipt.write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
