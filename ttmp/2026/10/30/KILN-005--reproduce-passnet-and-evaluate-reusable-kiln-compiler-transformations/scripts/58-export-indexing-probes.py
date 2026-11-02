#!/usr/bin/env python3
from pathlib import Path
import json,sys
import torch
from torch.fx import symbolic_trace
p=Path(__file__).resolve().parents[1]
repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
from corpus import FORMAT,load_module
source='''import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return x[:,1:-1,-2,None],x[...,1,None],x[1,:,:]
'''
out=p/'sources/indexing';out.mkdir(exist_ok=True)
records=[]
for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
 graph=f'indexing-fixtures/{name}';directory=p/'sources'/graph;directory.mkdir(parents=True,exist_ok=True)
 (directory/'model.py').write_text(source)
 model=load_module(directory/'model.py').GraphModule()
 result=import_graph(export_graph(symbolic_trace(model),(torch.randn(2,5,4).to(dtype),)))
 script=f'{name}.kiln.js';(out/script).write_text(result['script'])
 records.append({'graph':graph,'script':script,'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],'output_structure':result['output_structure']})
(out/'manifest.json').write_text(json.dumps({'format':FORMAT,'sample':'independent-indexing-probe','variants':records},indent=2)+'\n')
