#!/usr/bin/env python3
"""Compare source pattern trace with Dynamo graph without altering evaluator."""
import importlib.util
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher

source=Path('/work/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/8/samples/torchgeometric/LINKX/_decomposed/LINKX_start17_end20_5/model.py')
spec=importlib.util.spec_from_file_location('original',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def pattern(mean, variance, bias, weight, x):
    return torch.nn.functional.dropout(torch.nn.functional.batch_norm(torch.nn.functional.relu(x, inplace=False), mean, variance, weight, bias, False, 0.1, 1e-5), p=0.0, training=False)

pat=symbolic_trace(pattern)
print('PATTERN',pat.graph,flush=True)
def backend(gm, inputs):
    print('DYNAMO',gm.graph,flush=True)
    for node in gm.graph.nodes:
        print(node.op,repr(node.target),node.args,node.kwargs,flush=True)
    print('MATCHES',len(SubgraphMatcher(pat.graph).match(gm.graph)),flush=True)
    return gm.forward
args=(torch.zeros(128,device='cuda'),torch.ones(128,device='cuda'),torch.zeros(128,device='cuda'),torch.ones(128,device='cuda'),torch.randn(1000,128,device='cuda'))
torch.compile(module.GraphModule(),backend=backend)(*args)
