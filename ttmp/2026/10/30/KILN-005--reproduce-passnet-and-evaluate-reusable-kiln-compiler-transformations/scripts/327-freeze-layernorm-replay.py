#!/usr/bin/env python3
"""Freeze all seven variants of the structurally mismatched LayerNorm family."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources';old=p/'gelu-source-cohort-plan.json';plan=json.loads(old.read_text())
plan.update(selection='Targeted repair qualification of the complete seven-variant task151 that failed matching in gelu-source-cohort-v1; no shape/dtype filtering and no new optimization confirmation claim',prior_plan_sha256=hashlib.sha256(old.read_bytes()).hexdigest(),tasks=[row for row in plan['tasks'] if row['index']==151])
assert len(plan['tasks'])==1 and plan['tasks'][0]['graphs']==7
with (p/'gelu-layernorm-replay-plan.json').open('x') as file:file.write(json.dumps(plan,indent=2)+'\n')
print('Frozen complete 7-variant matching-repair task')
