#!/usr/bin/env python3
"""Compare source pattern trace with Dynamo graph without altering evaluator."""
import importlib.util
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher

source=Path('/work/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float16/9/samples/transformers-auto-model/apple_DepthPro-hf/_decomposed/apple_DepthPro-hf_start2292_end2296_54/model.py')
spec=importlib.util.spec_from_file_location('original',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def pattern(bias,weight,residual,x):
    conv=torch.conv2d(x,weight,bias,(2,2),(1,1),(1,1),1)
    relu=torch.nn.functional.relu(conv,inplace=True)
    return torch.nn.functional.interpolate(residual+relu,size=(24,24),mode='bilinear',align_corners=False)

pat=symbolic_trace(pattern)
print('PATTERN',pat.graph,flush=True)
def backend(gm, inputs):
    print('DYNAMO',gm.graph,flush=True)
    for node in gm.graph.nodes:
        print(node.op,repr(node.target),node.args,node.kwargs,flush=True)
    print('MATCHES',len(SubgraphMatcher(pat.graph).match(gm.graph)),flush=True)
    return gm.forward
from pass_bench.torch.test_compiler import get_input_dict
import argparse
named=get_input_dict(argparse.Namespace(model_path=str(source.parent),device='cuda'))
args=tuple(named[f'in_{i}'] for i in range(len(named)))
torch.compile(module.GraphModule(),backend=backend)(*args)
