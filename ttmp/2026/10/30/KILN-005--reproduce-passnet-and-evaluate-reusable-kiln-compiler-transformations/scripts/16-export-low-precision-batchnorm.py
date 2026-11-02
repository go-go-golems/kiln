#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import sys
import torch
from torch.fx import symbolic_trace
TICKET=Path(__file__).resolve().parents[1]
REPO=next(p for p in TICKET.parents if (p/'integrations/passnet/fx_import.py').exists())
sys.path.insert(0,str(REPO/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
source=TICKET/'sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/8/samples/torchgeometric/LINKX/_decomposed/LINKX_start17_end20_5/model.py'
spec=importlib.util.spec_from_file_location('original',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
for name,dtype in [('f16',torch.float16),('bf16',torch.bfloat16)]:
 inputs=(torch.zeros(128,dtype=dtype),torch.ones(128,dtype=dtype),torch.zeros(128,dtype=dtype),torch.ones(128,dtype=dtype),torch.randn(1000,128).to(dtype))
 lowered=import_graph(export_graph(symbolic_trace(module.GraphModule()),inputs))
 script=lowered['script'].rstrip().removesuffix(';')
 script+='\n.data({v0: new Tensor([128], new Float32Array(128)), v1: new Tensor([128], new Float32Array(128).fill(1)), v2: new Tensor([128], new Float32Array(128)), v3: new Tensor([128], new Float32Array(128).fill(1)), v4: Tensor.random([1000,128], {seed:42,dist:"uniform"})});\n'
 (TICKET/f'sources/batchnorm-{name}.kiln.js').write_text(script)
 print(name,'generated')
