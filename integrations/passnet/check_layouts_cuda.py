"""Validate imported layout/cast chains, including output metadata aliases."""
from pathlib import Path
import sys
import torch
from runtime import TorchProgram
root=Path(sys.argv[1])
torch.manual_seed(42)
x=torch.randn(2,3,4,device='cuda')
p=TorchProgram(root/'layouts/probe.json',include_paths=['/usr/local/cuda/include'])
y=x.permute(0,2,1).contiguous().reshape(2,12)
expected=(y.half().float(),y.bfloat16().float(),x.flatten(1),x.view(6,4))
actual=p(x)
for i,reference in enumerate(expected):
 result=actual[f'out{i}']
 assert result.shape==reference.shape,(i,result.shape,reference.shape)
 assert result.dtype==reference.dtype
 torch.testing.assert_close(result,reference,rtol=0,atol=0)
 print('layout output',i,'PASS',tuple(result.shape),flush=True)
torch.cuda.synchronize();p.close()
