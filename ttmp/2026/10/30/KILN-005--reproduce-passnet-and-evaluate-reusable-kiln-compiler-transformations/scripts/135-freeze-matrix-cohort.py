#!/usr/bin/env python3
"""Freeze every newly complete import family; no measured outcome selection."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources'
old=s/'import-audit-after-activations-summary.json';new=s/'import-audit-after-linalg-mutation-summary.json'
before={r['task'] for r in json.loads(old.read_text())['tasks_fully_imported']}
after={r['task']:r for r in json.loads(new.read_text())['tasks_fully_imported']}
inventory=json.loads((s/'evaluation-inventory.json').read_text())['samples']
tasks=[]
for index,row in enumerate(inventory):
 sample=row['sample']
 if sample in after and sample not in before:
  membership=(s/'upstream'/sample/'graph_list.txt').read_bytes()
  tasks.append({'index':index,'sample':sample,'graphs':after[sample]['graphs'],'graph_list_sha256':hashlib.sha256(membership).hexdigest()})
result={'format':'kiln-task-plan/1','selection':'All evaluation task families newly fully importable after matrix lowering and faithful mutation tracing, relative to activation milestone; includes partial earlier task 121; no correctness or timing filtering',
 'audit_sha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [old,new]},'nominal_tolerance':-5,'target':'a100','hardware':'DGX Spark GB10; exploratory modified integration protocol','tasks':tasks}
(s/'matrix-cohort-plan.json').write_text(json.dumps(result,indent=2)+'\n')
print(len(tasks),'tasks',sum(r['graphs'] for r in tasks),'graphs',[r['index'] for r in tasks])
