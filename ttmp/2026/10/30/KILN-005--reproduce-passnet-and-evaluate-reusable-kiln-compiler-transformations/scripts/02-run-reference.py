#!/usr/bin/env python3
"""Run untouched PassBench with explicit paper timing settings and isolated logs."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--upstream", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--compiler", choices=["nope", "inductor"], required=True)
parser.add_argument("--limit", type=int, default=0, help="0 means the complete 200-task evaluation")
args = parser.parse_args()
root = args.upstream.resolve()
args.output.mkdir(parents=True, exist_ok=True)
samples = (root / "sample_lists/eval/hf_fusible_eval_samples_v2.txt").read_text().splitlines()
if args.limit:
    samples = samples[:args.limit]
results = []
for index, sample in enumerate(samples):
    sample_dir = root / sample
    allow = sample_dir / "graph_list.txt"
    command = [sys.executable, "-m", "pass_bench.torch.test_compiler",
               "--allow-list", str(allow), "--model-path-prefix", str(root),
               "--compiler", args.compiler, "--device", "cuda", "--warmup", "20", "--trials", "100"]
    started = time.time()
    with (args.output / f"{index:03d}-{args.compiler}.log").open("w") as log:
        result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
    results.append({"sample": sample, "compiler": args.compiler, "command": command,
                    "returncode": result.returncode, "elapsed_seconds": time.time()-started})
    (args.output / "execution-receipt.json").write_text(json.dumps(results, indent=2)+"\n")
    print(f"{index+1}/{len(samples)} {sample}: exit={result.returncode}", flush=True)
