#!/usr/bin/env python3
"""Freeze ALL newly complete import families, before original GPU evaluation."""
import collections,hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';up=s/'upstream'
old=json.loads((s/'import-audit-after-functional-transpose.json').read_text());new=json.loads((s/'import-audit-after-softmax.json').read_text())
def groups(audit):
 out=collections.defaultdict(list)
 for row in audit['records']:out[row['sample']].append(row)
 return out
before=groups(old);after=groups(new);samples=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines();tasks=[]
for sample,rows in after.items():
 if all(r['status']=='imported' for r in rows) and any(r['status']!='imported' for r in before[sample]):
  data=(up/sample/'graph_list.txt').read_bytes()
  if data.decode().splitlines()!=[r['graph'] for r in rows]:raise ValueError('Audit membership differs')
  tasks.append({'index':samples.index(sample),'sample':sample,'graphs':len(rows),'graph_list_sha256':hashlib.sha256(data).hexdigest()})
plan={'format':'kiln-task-plan/1','selection':'All newly completely importable evaluation families after source softmax lowering; no shape/dtype filtering and no performance selection; exploratory development qualification','nominal_tolerance':-5,'target':'a100','hardware':'DGX Spark GB10; exploratory modified integration protocol','contraction':'separate','audit_sha256':{name:hashlib.sha256((s/name).read_bytes()).hexdigest() for name in ['import-audit-after-functional-transpose.json','import-audit-after-softmax.json']},'tasks':tasks}
output=s/'softmax-cohort-plan.json'
if output.exists():raise ValueError('Preserve frozen plan')
output.write_text(json.dumps(plan,indent=2)+'\n');print(len(tasks),'tasks',sum(r['graphs'] for r in tasks),'graphs')
