#!/usr/bin/env python3
"""Record policy controls and source-derived reference-domain constraints."""
import argparse,json,sys
import torch
from torch.fx import symbolic_trace
from pathlib import Path
p=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--directory',type=Path,default=p/'sources/policy-corpus-v1');directory=parser.parse_args().directory
repo=next(r for r in p.parents if (r/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import load_module
manifest=json.loads((directory/'manifest.json').read_text());policies=directory/'policies';policies.mkdir(exist_ok=True)
for name,threshold in [('baseline',None),('disabled',0.0),('strict',1.0),('default',1.02),('relaxed125',1.25),('relaxed2',2.0)]:
 policy={'format':'kiln-fusion-policy/1','id':name,'kind':'unchanged' if threshold is None else 'threshold'}
 if threshold is not None:policy['max_work_growth']=threshold
 (policies/(name+'.json')).write_text(json.dumps(policy,indent=2)+'\n')
records=[]
for r in manifest['variants']:
 model=load_module(p/'sources/upstream'/r['graph']/'model.py').GraphModule()
 traced=symbolic_trace(model);names={node:'v'+str(i) for i,node in enumerate(traced.graph.nodes) if node.op=='placeholder'};constraints=[]
 for node in traced.graph.nodes:
  if node.op=='call_function' and node.target is torch.nn.functional.batch_norm:
   value=node.kwargs.get('running_var',node.args[2] if len(node.args)>2 else None)
   if value not in names:raise ValueError('Cannot identify batch_norm running variance input')
   input_name=names[value]
   if input_name not in r['inputs']:raise ValueError('Variance is not a source input')
   constraints.append({'input':input_name,'kind':'positive','offset':0.1})
 records.append({'graph':r['graph'],'constraints':constraints})
receipt={'format':'kiln-reference-domains/1','membership_sha256':manifest['membership_sha256'],'scope':'Synthetic compiler reference checks only; GPU validation uses original source inputs.','records':records}
(directory/'reference-domains.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Prepared six policies and reference domains for',len(records),'graphs')
