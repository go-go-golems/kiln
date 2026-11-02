"""Freeze complete membership of all four newly importable pooling families."""
import collections,hashlib,json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';up=s/'upstream'
rows=json.loads((s/'avg-pooling-import-v1/results.json').read_text())['records']
groups=collections.defaultdict(list)
for r in rows:groups[r['sample']].append(r)
samples=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks=[]
for sample,records in groups.items():
 data=(up/sample/'graph_list.txt').read_bytes()
 assert data.decode().splitlines()==[r['graph'] for r in records]
 assert all(r['status']=='imported' for r in records)
 tasks.append({'index':samples.index(sample),'sample':sample,'graphs':len(records),'graph_list_sha256':hashlib.sha256(data).hexdigest()})
plan={'format':'kiln-task-plan/1','selection':'All four newly importable avg_pool2d families, complete membership without shape/dtype filtering.','nominal_tolerance':-5,'target':'a100','hardware':'NVIDIA GB10; modified integration protocol','contraction':'separate','tasks':tasks}
with (s/'avg-pooling-task-plan-v1.json').open('x') as f:json.dump(plan,f,indent=2);f.write('\n')
print([(t['index'],t['graphs']) for t in tasks])
