"""Verify imported normalization accumulation on genuine first-task shape."""
from pathlib import Path
import sys
import torch
from runtime import TorchProgram
for name,dtype,rtol in [('f16',torch.float16,1e-3),('bf16',torch.bfloat16,1.6e-2)]:
 p=TorchProgram(Path(sys.argv[1])/f'batchnorm-{name}.json',include_paths=['/usr/local/cuda/include'])
 torch.manual_seed(42)
 mean=torch.randn(128,device='cuda').to(dtype)
 var=(torch.rand(128,device='cuda')+0.2).to(dtype)
 bias=torch.randn(128,device='cuda').to(dtype)
 weight=torch.randn(128,device='cuda').to(dtype)
 x=torch.randn(1000,128,device='cuda').to(dtype)
 out=p(mean,var,bias,weight,x)['out0']
 expected=torch.nn.functional.batch_norm(torch.relu(x),mean,var,weight,bias,False,0.1,1e-5)
 assert out.dtype==dtype
 torch.testing.assert_close(out,expected,rtol=rtol,atol=1e-5)
 torch.cuda.synchronize();p.close()
 print(f'PASS: {name} imported batch_norm, max_abs_error={(out-expected).abs().max().item()}')
