#!/usr/bin/env python3
"""Freeze all nine members of the task whose synthetic setup exhausted memory."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';source=s/'reference-domain-cohort-v1/run.json';run=json.loads(source.read_text())
if run['status']!='complete':raise ValueError('Earlier run must be terminal')
plan=dict(run['plan']);plan['tasks']=[r for r in plan['tasks'] if r['index']==182]
if len(plan['tasks'])!=1 or plan['tasks'][0]['graphs']!=9:raise ValueError('Unexpected full-task membership')
plan['selection']='All nine variants of task 182; rerun after removing eager allocation of unrelated synthetic inputs; variance samples and original evaluation criteria unchanged'
plan['original_run_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
(s/'selective-reference-cohort-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print('1 task, 9 graphs; no partial-task filtering')
