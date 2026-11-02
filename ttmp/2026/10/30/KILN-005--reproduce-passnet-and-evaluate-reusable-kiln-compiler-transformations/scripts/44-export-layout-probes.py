#!/usr/bin/env python3
"""Independent PyTorch FX probes for layout/cast value semantics."""
from pathlib import Path
import sys
import torch
from torch.fx import symbolic_trace
p=Path(__file__).resolve().parents[1]
repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
class Model(torch.nn.Module):
 def forward(self,x):
  y=x.permute(0,2,1).contiguous().reshape(2,12)
  return y.half().float(), y.bfloat16().float(), x.flatten(1), x.view(6,4)
out=p/'sources/layouts';out.mkdir(exist_ok=True)
result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),)))
(out/'probe.kiln.js').write_text(result['script'])
