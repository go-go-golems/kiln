"""Full-compiler exported typed view check against PyTorch CUDA."""
from pathlib import Path
import sys
import torch
from runtime import TorchProgram
for name,dtype in [('f16',torch.float16),('bf16',torch.bfloat16)]:
    program=TorchProgram(Path(sys.argv[1])/f'typed-transpose-{name}.json',include_paths=['/usr/local/cuda/include'])
    assert program.artifact['outputs'][0]['dtype']==name
    assert program.artifact['buffers'][program.artifact['outputs'][0]['buffer']]['bytes']==12
    x=torch.tensor([[1.25,-2.5,3.75],[4.5,5.25,-6.125]],dtype=dtype,device='cuda')
    out=program(x)['out']
    assert out.dtype==dtype and tuple(out.shape)==(3,2)
    torch.testing.assert_close(out,x.t(),rtol=0,atol=0)
    torch.cuda.synchronize();program.close()
    print(f'PASS: full pipeline {name} transpose, typed output and exact GPU values')
