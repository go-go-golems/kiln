from pathlib import Path
import sys
import torch
from runtime import TorchProgram
root=Path(sys.argv[1])
for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
 assert (root/'reductions'/f'{name}.json').exists()
for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
 torch.manual_seed(42);x=torch.randn(2,3,4,device='cuda').to(dtype)
 p=TorchProgram(root/'reductions'/f'{name}.json',include_paths=['/usr/local/cuda/include'])
 actual=p(x)['out0'];expected=x.mean(dim=(-1,0))
 assert actual.dtype==expected.dtype and actual.shape==expected.shape
 torch.testing.assert_close(actual,expected,rtol={torch.float32:1.3e-6,torch.float16:1e-3,torch.bfloat16:1.6e-2}[dtype],atol=1e-5)
 torch.cuda.synchronize();p.close();print(name,'multi-axis mean PASS',flush=True)
