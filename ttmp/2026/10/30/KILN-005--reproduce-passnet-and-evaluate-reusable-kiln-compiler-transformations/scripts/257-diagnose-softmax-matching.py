#!/usr/bin/env python3
"""Record actual source-pattern versus Dynamo argument representation."""
import importlib.util,sys
from pathlib import Path
import torch
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from generate_pass import extract_pattern
from fx_normalize import trace_pattern,normalize_arguments
source=p/'sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float16/5/samples/mmseg/OCRNet_R101/_decomposed/OCRNet_R101_start388_end392_5/model.py'
text,*_=extract_pattern(source.read_text(),2);scope={};exec(text,scope);pattern=trace_pattern(scope['pattern'])
print('PATTERN BEFORE',pattern.code);print('NORMALIZATION',normalize_arguments(pattern));print('PATTERN AFTER',pattern.code)
spec=importlib.util.spec_from_file_location('softmax_diagnostic',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def backend(gm,inputs):
 print('DYNAMO BEFORE',gm.code);print('NORMALIZATION',normalize_arguments(gm));print('DYNAMO AFTER',gm.code)
 return gm.forward
torch.compile(module.GraphModule(),backend=backend)(torch.randn(2,3,4),torch.randn(2,4,5))
