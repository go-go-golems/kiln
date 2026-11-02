"""Freeze only the seven newly importable complete families for the next GPU replay."""
import json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources'
old=json.loads((s/'parallel-port-task-plan-v1.json').read_text());all_=json.loads((s/'parallel-port-task-plan-v2.json').read_text())
seen={x['sample'] for x in old['tasks']};tasks=[x for x in all_['tasks'] if x['sample'] not in seen]
assert len(tasks)==7 and sum(t['graphs'] for t in tasks)==33
plan=all_.copy();plan['selection']='Seven newly complete families from second blocker batch; earlier 16 families run separately.';plan['tasks']=tasks
with (s/'parallel-port-task-plan-v3-delta.json').open('x') as f:json.dump(plan,f,indent=2);f.write('\n')
print([(t['index'],t['graphs']) for t in tasks])
