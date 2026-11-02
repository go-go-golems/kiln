"""Run in the PassBench CUDA environment; verifies one allowance and rejection."""
import torch
from dispatch_policy import install_record_stream_policy
from pass_bench.torch.posion_dispatch_tensor import wrap_tensor

install_record_stream_policy()
x=wrap_tensor(torch.ones(8,device='cuda'))
x.record_stream(torch.cuda.current_stream())
try:
    torch.add(x,x)
except RuntimeError as exc:
    assert 'Unauthorized Operator' in str(exc), str(exc)
else:
    raise AssertionError('Arithmetic guard unexpectedly allowed aten.add')
print('PASS: record_stream allowed, arithmetic still rejected')
