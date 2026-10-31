"""Verify genuine first-task FP32 shape using nontrivial inference statistics."""
import sys
import torch
from runtime import TorchProgram

torch.manual_seed(42)
p = TorchProgram(sys.argv[1])
mean = torch.randn(128, device='cuda')
var = torch.rand(128, device='cuda') + 0.2
bias = torch.randn(128, device='cuda')
weight = torch.randn(128, device='cuda')
x = torch.randn(1000,128, device='cuda')
actual = p(mean,var,bias,weight,x)['out0']
expected = torch.nn.functional.batch_norm(torch.relu(x),mean,var,weight,bias,False,0.1,1e-5)
torch.testing.assert_close(actual,expected,rtol=1.3e-6,atol=1e-5)
torch.cuda.synchronize()
print('PASS: first-task FP32 shape batch_norm, nontrivial mean/variance/affine, max_abs_error=',(actual-expected).abs().max().item())
p.close()
