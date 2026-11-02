#!/usr/bin/env python3
"""Predeclare a small FP32 policy corpus before candidate timing.

Task families stay on one side; previously observed integration tasks are not a
blind benchmark. This split holds out policy-search performance feedback.
"""
import argparse,hashlib,json,sys,re
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import FORMAT,translate_graph
upstream=p/'sources/upstream';inventory=json.loads((p/'sources/evaluation-inventory.json').read_text())
parser=argparse.ArgumentParser();parser.add_argument('--version',default='v1');parser.add_argument('--extra-heldout-tasks',type=int,nargs='*',default=[]);args=parser.parse_args()
if not re.fullmatch(r'v[0-9]+',args.version):raise ValueError('Expected version vN')
out=p/('sources/policy-corpus-'+args.version);out.mkdir(exist_ok=True)
if (out/'manifest.json').exists():raise SystemExit('Frozen corpus already exists; use a new version rather than silently changing membership')
records=[]
for task_index,split in [(0,'train'),(11,'train'),(1,'heldout'),(198,'heldout')]+[(i,'heldout') for i in args.extra_heldout_tasks]:
 sample=inventory['samples'][task_index]['sample'];candidates={}
 for graph in (upstream/sample/'graph_list.txt').read_text().splitlines():
  result=translate_graph(upstream,graph,'fake')
  if set(result['input_dtypes'].values())!={'f32'}:continue
  elements=0
  for shape in result['inputs'].values():
   n=1
   for d in shape:n*=d
   elements+=n
  if elements>20000000:continue
  digest=hashlib.sha256(result['script'].encode()).hexdigest()
  candidates.setdefault(digest,(elements,graph,result,digest))
 ordered=sorted(candidates.values(),key=lambda row:(row[0],row[1]))
 if not ordered:raise ValueError(f'No eligible FP32 graph in task {task_index}')
 chosen=[ordered[0]]+([ordered[-1]] if len(ordered)>1 else [])
 for elements,graph,result,digest in chosen:
  filename=f'{len(records):03d}.kiln.js';(out/filename).write_text(result['script'])
  model='/'.join(graph.split('/samples/',1)[1].split('/')[:2])
  records.append({'graph':graph,'sample':sample,'task_index':task_index,'split':split,'model':model,'script':filename,
   'source_sha256':digest,'input_elements':elements,'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],'output_structure':result['output_structure']})
train_models={r['model'] for r in records if r['split']=='train'};test_models={r['model'] for r in records if r['split']=='heldout'}
if train_models&test_models:raise ValueError('Source model overlaps training and held-out split')
identity=hashlib.sha256(json.dumps(records,sort_keys=True).encode()).hexdigest()
manifest={'format':FORMAT,'sample':'policy-corpus-fp32-'+args.version,'selection':'FP32 only, no convolution, verified task families, min/max eligible input volume per family, <=20M input elements',
 'split_contract':f'train task indices 0/11; heldout 1/198 plus {args.extra_heldout_tasks}; no task/model overlap; development study drawn from evaluation tasks, not an untouched paper benchmark',
 'membership_sha256':identity,'variants':records}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for r in records:print(r['split'],r['task_index'],r['input_elements'],r['graph'])
print('Frozen membership',identity)
