"""Freeze eight previously unmatched complete families for the pad/hardtanh normalizer replay."""
import json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources'
first=json.loads((s/'parallel-port-task-plan-v1.json').read_text());delta=json.loads((s/'parallel-port-task-plan-v3-delta.json').read_text())
lookup={r['index']:r for r in first['tasks']+delta['tasks']};ids=[142,106,165,163,149,144,159,83];tasks=[lookup[i] for i in ids]
plan=first.copy();plan['selection']='Eight complete families with captured first-graph structural matches after pad/hardtanh normalization; task107 qualified separately.';plan['tasks']=tasks
with (s/'normalized-matcher-task-plan-v1.json').open('x') as f:json.dump(plan,f,indent=2);f.write('\n')
print([(t['index'],t['graphs']) for t in tasks])
