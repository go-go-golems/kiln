#!/usr/bin/env python3
from pathlib import Path
import sys
import torch
from torch.fx import symbolic_trace
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
class Model(torch.nn.Module):
 def forward(self,x): return x.mean(dim=(-1,0),keepdim=False)
out=p/'sources/reductions';out.mkdir(exist_ok=True)
for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
 result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4).to(dtype),)))
 (out/f'{name}.kiln.js').write_text(result['script'])
