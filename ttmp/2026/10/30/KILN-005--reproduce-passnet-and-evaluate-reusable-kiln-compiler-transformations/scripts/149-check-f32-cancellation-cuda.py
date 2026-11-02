#!/usr/bin/env python3
"""Verify the exact FP32 cancellation oracle on the actual CUDA executable."""
import json,sys
from pathlib import Path
sys.path[:0]=['/work/kiln/runtime/python','/work/kiln/integrations/passnet']
import torch
from runtime import TorchProgram
x=torch.tensor([100000000.],device='cuda',dtype=torch.float32)
expected=((x+1)-100000000).to(torch.bfloat16)
program=TorchProgram('/work/f32-cancellation.kiln.json',include_paths=['/usr/local/cuda/include'])
try:
 actual=program(x)['out'];torch.cuda.synchronize()
 torch.testing.assert_close(actual,expected,rtol=0,atol=0)
 if actual.item()!=0:raise AssertionError('Cancellation must round intermediate addition to FP32')
 result={'torch':torch.__version__,'gpu':torch.cuda.get_device_name(),'actual':actual.item(),'expected':expected.item(),'dtype':str(actual.dtype),'status':'passed','scope':'One-element FP32 scalar register cancellation with BF16 output; exact equality'}
 Path('/work/f32-cancellation-cuda.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:program.close()
