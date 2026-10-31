#!/usr/bin/env python3
"""Rerun every compile-blocked family after a shared synthetic-domain fix."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';source=s/'matrix-cohort-v1/run.json';run=json.loads(source.read_text())
if run['status']!='complete':raise ValueError('Original cohort must be terminal')
indices={r['index'] for r in run['records'] if r.get('failed_phase')=='compile'}
plan=dict(run['plan']);plan['tasks']=[r for r in plan['tasks'] if r['index'] in indices]
plan['selection']='All compile-blocked families from matrix cohort v1; shared source-derived positive variance for synthetic reference checks only; original runtime inputs/tolerances unchanged'
plan['original_run_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
(s/'reference-domain-cohort-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print(len(plan['tasks']),'tasks',sum(r['graphs'] for r in plan['tasks']),'graphs',sorted(indices))
