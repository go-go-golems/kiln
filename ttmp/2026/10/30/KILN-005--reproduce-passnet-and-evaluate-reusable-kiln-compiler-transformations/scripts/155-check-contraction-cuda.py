#!/usr/bin/env python3
"""Exact CUDA oracle for FMA contraction versus separate FP32 rounding."""
import hashlib,json,sys
from pathlib import Path
sys.path[:0]=['/work/kiln/runtime/python','/work/kiln/integrations/passnet']
import torch
from runtime import TorchProgram
values=[torch.tensor([v],device='cuda',dtype=torch.float32) for v in [1+2**-23,1-2**-23,-1]]
native=(values[0]*values[1]+values[2]).to(torch.bfloat16)
rows=[]
for mode,expected in [('allow',-(2**-46)),('separate',0.)]:
 artifact=Path('/work/fma-boundary-'+mode+'.json')
 program=TorchProgram(artifact,include_paths=['/usr/local/cuda/include'])
 try:
  result=program(*values)['out'];torch.cuda.synchronize()
  if result.item()!=expected:raise AssertionError((mode,result.item(),expected))
  if mode=='separate':torch.testing.assert_close(result,native,rtol=0,atol=0)
  rows.append({'mode':mode,'actual':result.item(),'expected':expected,'source':json.loads(artifact.read_text())['source'],'artifact_sha256':hashlib.sha256(artifact.read_bytes()).hexdigest()})
 finally:program.close()
receipt={'status':'passed','torch':torch.__version__,'gpu':torch.cuda.get_device_name(),'native_separate_result':native.item(),'scope':'Exact one-element rounding oracle; not general benchmark equivalence','records':rows}
Path('/work/contraction-cuda.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
