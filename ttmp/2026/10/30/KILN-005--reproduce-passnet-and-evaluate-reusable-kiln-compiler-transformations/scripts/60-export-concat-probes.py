#!/usr/bin/env python3
"""Independent concat/transpose/slice probes, with homogeneous and mixed dtypes."""
from pathlib import Path
import json,sys
import torch
from torch.fx import symbolic_trace
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
from corpus import FORMAT,load_module
source='''import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,y,z):
  return torch.cat((x,y,z),dim=-1),torch.cat((x.transpose(0,1),y.transpose(0,1),z.transpose(0,1)),dim=0),torch.cat((x,y,z),dim=-1)[:,1:-1]
'''
out=p/'sources/concat';out.mkdir(exist_ok=True);records=[]
for name,dtypes in [('f32',[torch.float32]*3),('f16',[torch.float16]*3),('bf16',[torch.bfloat16]*3),('mixed',[torch.float16,torch.bfloat16,torch.float16])]:
 graph=f'concat-fixtures/{name}';directory=p/'sources'/graph;directory.mkdir(parents=True,exist_ok=True)
 (directory/'model.py').write_text(source)
 model=load_module(directory/'model.py').GraphModule()
 inputs=[torch.randn(2,n).to(dtype) for n,dtype in zip([1,2,3],dtypes)]
 result=import_graph(export_graph(symbolic_trace(model),inputs));script=f'{name}.kiln.js';(out/script).write_text(result['script'])
 records.append({'graph':graph,'script':script,'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],'output_structure':result['output_structure']})
(out/'manifest.json').write_text(json.dumps({'format':FORMAT,'sample':'independent-concat-probes','variants':records},indent=2)+'\n')
