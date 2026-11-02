#!/usr/bin/env python3
"""Capture actual source FX/Dynamo matching without invoking a CUDA replacement."""
import argparse,json,sys
from pathlib import Path
import torch
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import load_module,source_order_inputs
from generate_pass import extract_pattern
from fx_normalize import trace_pattern,normalize_arguments
parser=argparse.ArgumentParser();parser.add_argument('--output',default='gelu-source-matching-diagnostic-v1.json');options=parser.parse_args();assert Path(options.output).name==options.output
s=p/'sources';directory=s/'gelu-source-cohort-v1/task-151';record=json.loads((directory/'corpus/manifest.json').read_text())['variants'][0]
source=s/'upstream'/record['graph']/'model.py';text,*_=extract_pattern(source.read_text(),len(record['inputs']));namespace={};exec(text,namespace)
pattern=trace_pattern(namespace['pattern']);normalize_arguments(pattern)
inputs=source_order_inputs(record,[torch.randn(shape).to({'f16':torch.float16,'bf16':torch.bfloat16,'f32':torch.float32}[record['input_dtypes'][name]]) for name,shape in record['inputs'].items()])
model=load_module(source).GraphModule();captured=[]
def backend(graph,args):captured.append(graph);return graph.forward
expected=torch.compile(model,backend=backend,fullgraph=True)(*inputs)
assert len(captured)==1
actual=captured[0];changes=normalize_arguments(actual)
result={'graph':record['graph'],'torch':torch.__version__,'pattern':str(pattern.graph),'dynamo':str(actual.graph),'normalization':changes,'matches':len(SubgraphMatcher(pattern.graph).match(actual.graph)),'scope':'CPU structural diagnosis with the original source and no replacement execution'}
with (s/options.output).open('x') as file:file.write(json.dumps(result,indent=2)+'\n')
print(result['pattern']);print(result['dynamo']);print('matches',result['matches'])
