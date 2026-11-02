#!/usr/bin/env python3
"""Independent source fixtures for matrix ranks, broadcasting and dtype boundaries."""
import hashlib,json,sys
from pathlib import Path
import torch
from torch.fx import symbolic_trace
root=Path(__file__).resolve().parents[1];repo=next(p for p in root.parents if (p/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import load_module,FORMAT
from fx_export import export_graph
from fx_import import import_graph
out=root/'sources/linalg-fixtures';out.mkdir(exist_ok=True);records=[]
cases=[('vv','a,b','a@b',[(17,),(17,)]),('vm','a,b','a@b',[(17,),(17,7)]),('mv','a,b','a@b',[(5,17),(17,)]),
 ('mm','a,b','torch.mm(a,b)',[(5,17),(17,7)]),('bmm','a,b','a.bmm(b)',[(2,5,17),(2,17,7)]),
 ('rhs-batch','a,b','torch.matmul(a,b)',[(5,17),(2,17,7)]),('lhs-vector-batch','a,b','a.matmul(b)',[(17,),(2,17,7)]),
 ('rhs-vector-batch','a,b','a@b',[(2,5,17),(17,)]),('two-sided-broadcast','a,b','a@b',[(2,1,5,17),(1,3,17,7)]),
 ('transpose','a,b','a@b.transpose(-1,-2)',[(5,17),(7,17)]),('odd-k','a,b','a@b',[(8,129),(129,7)]),
 ('linear','x,w,b','torch.nn.functional.linear(x,w,b)',[(5,17),(7,17),(7,)]),
 ('linear-batch','x,w,b','torch.nn.functional.linear(x,w,b)',[(2,5,17),(7,17),(7,)]),
 ('linear-vector-weight','x,w','torch.nn.functional.linear(x,w)',[(2,5,17),(17,)])]
for label,params,expression,shapes in cases:
 for dtype_name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
  relative=f'linalg-probe-models/{label}-{dtype_name}';directory=root/'sources'/relative;directory.mkdir(parents=True,exist_ok=True)
  source='import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,'+params+'):\n  return '+expression+'\n'
  (directory/'model.py').write_text(source)
  model=load_module(directory/'model.py').GraphModule();inputs=[torch.randn(shape).to(dtype) for shape in shapes]
  result=import_graph(export_graph(symbolic_trace(model),inputs));script=f'{label}-{dtype_name}.kiln.js';(out/script).write_text(result['script'])
  records.append({'graph':relative,'script':script,'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],'output_structure':result['output_structure'],'source_sha256':hashlib.sha256(result['script'].encode()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'format':FORMAT,'sample':'independent-linalg-probes','variants':records},indent=2)+'\n')
print('Exported',len(records),'matrix fixtures')
