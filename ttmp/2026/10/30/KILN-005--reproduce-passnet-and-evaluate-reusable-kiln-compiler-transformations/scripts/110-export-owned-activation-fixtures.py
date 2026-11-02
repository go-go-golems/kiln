#!/usr/bin/env python3
"""Export operation-boundary activation fixtures for all supported storage dtypes."""
import json
from pathlib import Path
import sys
import torch
from torch.fx import symbolic_trace
root=Path(__file__).resolve().parents[1];repo=next(p for p in root.parents if (p/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
out=root/'sources/activation-owned-fixtures';out.mkdir(exist_ok=True)
class Model(torch.nn.Module):
 def forward(self,x,y):
  sigmoid=torch.sigmoid(x)
  return torch.nn.functional.silu(x),sigmoid,sigmoid*y,torch.nn.functional.silu(torch.relu(x),inplace=True)
for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
 values=[torch.randn(16,256).to(dtype) for _ in range(2)]
 exported=export_graph(symbolic_trace(Model()),values);imported=import_graph(exported)
 (out/(name+'.fx.json')).write_text(json.dumps(exported,indent=2)+'\n')
 (out/(name+'.kiln.js')).write_text(imported['script'])
print('Exported FP32/FP16/BF16 activation fixtures')
