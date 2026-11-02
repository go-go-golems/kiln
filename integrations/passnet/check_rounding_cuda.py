"""Verify explicit scalar rounding with FP32 storage on actual CUDA."""
import sys
from pathlib import Path
import torch
from runtime import TorchProgram

for name,dtype in [('f16',torch.float16),('bf16',torch.bfloat16)]:
    artifact={'format':'kiln-program/1','name':'round','inputs':[{'name':'x','buffer':0,'shape':[32],'dtype':'f32'}], 'outputs':[{'name':'out','buffer':1,'shape':[32],'dtype':'f32'}], 'buffers':[{'id':i,'dtype':'f32','elements':32,'bytes':128} for i in range(2)], 'kernels':[{'name':'explicit_round','cuda':(Path(sys.argv[1])/f'explicit-round-{name}.cu').read_text(),'reads':[0],'writes':1,'grid':1,'block':32}]}
    p=TorchProgram(artifact,include_paths=['/usr/local/cuda/include'])
    torch.manual_seed(42)
    x=torch.randn(32,device='cuda')*100
    x[0]=1+2**(-11 if name=='f16' else -8)
    actual=p(x)['out'];expected=x.to(dtype).float()
    torch.testing.assert_close(actual,expected,rtol=0,atol=0)
    torch.cuda.synchronize();p.close()
    print(f'PASS: explicit {name} scalar rounding matches PyTorch on CUDA')
