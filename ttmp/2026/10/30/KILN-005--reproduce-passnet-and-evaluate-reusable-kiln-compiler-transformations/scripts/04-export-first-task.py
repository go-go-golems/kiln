#!/usr/bin/env python3
"""Reproduce first-task FP32 FX import, with domain-valid compiler test data.

Run from any directory with local torch installed. No upstream source copied.
"""
import importlib.util
from pathlib import Path
import sys
import torch
from torch.fx import symbolic_trace

TICKET = Path(__file__).resolve().parents[1]
REPO = next(p for p in TICKET.parents if (p / 'integrations/passnet/fx_import.py').exists())
sys.path.insert(0, str(REPO / 'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph

source = TICKET / 'sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/8/samples/torchgeometric/LINKX/_decomposed/LINKX_start17_end20_5/model.py'
spec = importlib.util.spec_from_file_location('benchmark_model', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
torch.manual_seed(42)
inputs = (torch.zeros(128), torch.ones(128), torch.zeros(128), torch.ones(128), torch.randn(1000,128))
graph = export_graph(symbolic_trace(module.GraphModule()), inputs)
import json
(TICKET / 'sources/first-task-fp32.fx.json').write_text(json.dumps(graph, indent=2)+'\n')
lowered = import_graph(graph)
script = lowered['script'].rstrip().removesuffix(';')
script += '\n.data({v0: new Tensor([128], new Float32Array(128)), v1: new Tensor([128], new Float32Array(128).fill(1)), v2: new Tensor([128], new Float32Array(128)), v3: new Tensor([128], new Float32Array(128).fill(1)), v4: Tensor.random([1000,128], {seed: 42, dist: "uniform"})});\n'
(TICKET / 'sources/first-task-fp32.kiln.js').write_text(script)
print('Exported first-task-fp32.fx.json and first-task-fp32.kiln.js')
