#!/usr/bin/env python3
"""Freeze the P3a slice-1 GPU replay: every family that became fully importable and fully
compilable with integer storage pass-through and integer-to-float conversion (Steps 252-253).

Selection is compile-only: sources/typed-slice1-import-v1.json (import census) plus a local
compile of each newly importable family. Task 139 is excluded: it needs integer mul (slice 3).
Protocol: uniform qualification settings with matmul_precision "tf32" (P0 replay, reference 48).
"""
import hashlib, json
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
upstream = TICKET / 'sources/upstream'
OUTPUT = TICKET / 'sources/typed-slice1-replay-v1/plan.json'
INDICES = [54, 92, 134, 169, 181]
if OUTPUT.exists():
    raise SystemExit(f'{OUTPUT} exists; frozen plans are never rewritten')
samples = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks = []
for index in INDICES:
    membership = (upstream / samples[index] / 'graph_list.txt').read_bytes()
    tasks.append({'index': index, 'sample': samples[index], 'graphs': len(membership.decode().splitlines()),
                  'graph_list_sha256': hashlib.sha256(membership).hexdigest()})
plan = {'format': 'kiln-task-plan/1', 'band': 'typed-slice1',
        'selection': 'P3a slice 1: families newly complete under integer storage pass-through and integer-to-float conversion; complete families, no omitted graph variants.',
        'nominal_tolerance': -5, 'target': 'a100', 'hardware': 'NVIDIA GB10; modified FX matching integration protocol',
        'contraction': 'separate', 'skip_internal_reference_check': True, 'matmul_precision': 'tf32',
        'import_census_sha256': hashlib.sha256((TICKET / 'sources/typed-slice1-import-v1.json').read_bytes()).hexdigest(),
        'tasks': tasks}
OUTPUT.parent.mkdir(parents=True)
OUTPUT.write_text(json.dumps(plan, indent=2) + '\n')
print(len(tasks), 'tasks;', sum(t['graphs'] for t in tasks), 'graphs ->', OUTPUT.relative_to(TICKET))
