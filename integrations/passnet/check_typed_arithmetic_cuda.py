"""Full pipeline arithmetic chain with source-observable intermediate rounding."""
from pathlib import Path
import sys
import torch
from runtime import TorchProgram
for name,dtype in [('f16',torch.float16),('bf16',torch.bfloat16)]:
    p=TorchProgram(Path(sys.argv[1])/f'typed-arithmetic-{name}.json',include_paths=['/usr/local/cuda/include'])
    torch.manual_seed(42)
    x=torch.randn(32,device='cuda').to(dtype)
    y=torch.randn(32,device='cuda').to(dtype)
    actual=p(x,y)['out'];expected=(x+y)*0.5
    assert actual.dtype==dtype
    torch.testing.assert_close(actual,expected,rtol=0,atol=0)
    torch.cuda.synchronize();p.close()
    print(f'PASS: full pipeline {name} add/mul exact versus PyTorch')
