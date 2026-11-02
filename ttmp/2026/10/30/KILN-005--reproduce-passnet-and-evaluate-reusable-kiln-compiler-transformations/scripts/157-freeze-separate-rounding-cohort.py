#!/usr/bin/env python3
"""Freeze every previously compile-blocked family with an explicit numerical policy."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';source=s/'reference-domain-cohort-plan.json';plan=json.loads(source.read_text())
if [r['index'] for r in plan['tasks']]!=[51,60,82,182] or sum(r['graphs'] for r in plan['tasks'])!=63:raise ValueError('Preserve complete original development membership')
plan['contraction']='separate'
plan['selection']='All four previously compile-blocked complete families; development qualification after observed failures, not a held-out optimization claim; protected FP32 arithmetic with original evaluator inputs and numerical curve'
plan['source_plan_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
(s/'separate-rounding-cohort-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print('4 complete task families /63 variants; contraction separate')
