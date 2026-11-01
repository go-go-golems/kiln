#!/usr/bin/env python3
"""Freeze a complete-family GPU replay plan from task indices (generalizes 672).

Protocol: uniform qualification settings with matmul_precision "tf32" (reference 48). The census
file named by --census is hashed into the plan as the compile-only selection evidence.

usage: 673-freeze-task-replay.py --output sources/X/plan.json --band NAME --census sources/C.json \
         --selection "why these tasks" INDEX...
"""
import argparse, hashlib, json
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', required=True); p.add_argument('--band', required=True)
p.add_argument('--census', required=True); p.add_argument('--selection', required=True)
p.add_argument('indices', nargs='+', type=int)
a = p.parse_args()
output = TICKET / a.output
if output.exists(): raise SystemExit(f'{output} exists; frozen plans are never rewritten')
upstream = TICKET / 'sources/upstream'
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks = []
for index in a.indices:
    membership = (upstream / samples[index] / 'graph_list.txt').read_bytes()
    tasks.append({'index': index, 'sample': samples[index], 'graphs': len(membership.decode().splitlines()),
                  'graph_list_sha256': hashlib.sha256(membership).hexdigest()})
plan = {'format': 'kiln-task-plan/1', 'band': a.band, 'selection': a.selection, 'nominal_tolerance': -5, 'target': 'a100',
        'hardware': 'NVIDIA GB10; modified FX matching integration protocol', 'contraction': 'separate',
        'skip_internal_reference_check': True, 'matmul_precision': 'tf32',
        'import_census_sha256': hashlib.sha256((TICKET / a.census).read_bytes()).hexdigest(), 'tasks': tasks}
output.parent.mkdir(parents=True)
output.write_text(json.dumps(plan, indent=2) + '\n')
print(len(tasks), 'tasks;', sum(t['graphs'] for t in tasks), 'graphs ->', a.output)
