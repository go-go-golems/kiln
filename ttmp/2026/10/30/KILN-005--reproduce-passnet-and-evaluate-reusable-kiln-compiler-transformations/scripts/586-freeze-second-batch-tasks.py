"""Freeze complete graph membership of newly importable batch families."""
import hashlib,json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';up=s/'upstream'
rows=json.loads((s/'parallel-port-family-import-v4.json').read_text())['records']
samples=(up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()
tasks=[]
for row in rows:
 if not row['complete']:continue
 data=(up/row['sample']/'graph_list.txt').read_bytes()
 assert data.decode().splitlines()==[g['graph'] for g in row['graphs']]
 assert all(g['status']=='imported' for g in row['graphs'])
 tasks.append({'index':samples.index(row['sample']),'sample':row['sample'],'graphs':row['count'],'graph_list_sha256':hashlib.sha256(data).hexdigest()})
plan={'format':'kiln-task-plan/1','selection':'All23 complete newly importable parallel-port families, all shapes and dtypes.','nominal_tolerance':-5,'target':'a100','hardware':'NVIDIA GB10; modified integration protocol','contraction':'separate','tasks':tasks}
with (s/'parallel-port-task-plan-v2.json').open('x') as f:json.dump(plan,f,indent=2);f.write('\n')
print([(t['index'],t['graphs']) for t in tasks])
