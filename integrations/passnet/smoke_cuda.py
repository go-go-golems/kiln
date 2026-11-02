"""GPU correctness smoke test for an imported ReLU + broadcast add artifact."""
import sys
import torch
from runtime import TorchProgram

program = TorchProgram(sys.argv[1])
x = torch.randn(2, 3, device='cuda')
y = torch.randn(3, device='cuda')
for stream in [torch.cuda.current_stream(), torch.cuda.Stream()]:
    stream.wait_stream(torch.cuda.current_stream())
    with torch.cuda.stream(stream):
        out = program(x,y)['out0']
        torch.testing.assert_close(out, torch.relu(x)+y, rtol=1.3e-6, atol=1e-5)
    stream.synchronize()
program.close()
print('PASS: imported ReLU/add CUDA output on default and non-default streams')
