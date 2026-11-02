#!/usr/bin/env python3
"""Freeze the P0/P1 replay plan: complete ordinary-band families whose failures have a named,
implemented repair, plus accepted FP32 contraction controls.

Groups (task indices are frozen-plan indices; membership and graph-list hashes are copied
unchanged from sources/uniform-importable-qualification-v1/pending-ordinary-plan.json):
  identity   6, 24, 185   output-order pattern classes (commit 9de3901)
  matcher    79           sigmoid spelling canonicalization (commit 8ee076e)
  tf32       27, 52, 72, 88, 93, 133, 157, 118   FP32 linear/conv failures explained by a TF32 reference
  control    20, 42, 164  fully accepted FP32 conv/matmul families; must stay accepted under tf32
The plan declares matmul_precision "tf32"; evaluate_tasks refuses it if the image's reference
computes FP32 contractions. Everything else matches the uniform qualification protocol.
"""
import json
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
SOURCE = TICKET / 'sources/uniform-importable-qualification-v1/pending-ordinary-plan.json'
OUTPUT = TICKET / 'sources/p0-replay-v1/plan.json'
GROUPS = {'identity': [6, 24, 185], 'matcher': [79], 'tf32': [27, 52, 72, 88, 93, 133, 157, 118], 'control': [20, 42, 164]}

if OUTPUT.exists():
    raise SystemExit(f'{OUTPUT} exists; frozen plans are never rewritten')
source = json.loads(SOURCE.read_text())
by_index = {task['index']: task for task in source['tasks']}
order = [index for group in GROUPS.values() for index in group]
assert len(set(order)) == len(order)
plan = {key: value for key, value in source.items() if key not in ('tasks', 'band', 'selection')}
plan.update(selection='P0/P1 replay: named-repair ordinary families plus accepted FP32 contraction controls; '
                      'complete families, no omitted graph variants.',
            band='p0-replay', matmul_precision='tf32', groups=GROUPS,
            derived_from=str(SOURCE.relative_to(TICKET)), tasks=[by_index[index] for index in order])
OUTPUT.parent.mkdir(parents=True)
OUTPUT.write_text(json.dumps(plan, indent=2) + '\n')
print(len(plan['tasks']), 'tasks;', sum(t['graphs'] for t in plan['tasks']), 'graphs ->', OUTPUT.relative_to(TICKET))
