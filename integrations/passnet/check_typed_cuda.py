"""NVRTC/load/store integration test using emitter-generated typed CUDA."""
import sys
from pathlib import Path
import torch
from kiln_launch import open_program

root=Path(sys.argv[1])
for name,dtype in [('f16',torch.float16),('bf16',torch.bfloat16)]:
    artifact={'format':'kiln-program/1','name':'typed-copy','inputs':[{'name':'x','buffer':0,'shape':[32],'dtype':name}], 'outputs':[{'name':'out','buffer':1,'shape':[32],'dtype':name}], 'buffers':[{'id':i,'dtype':name,'elements':32,'bytes':64} for i in range(2)], 'kernels':[{'name':'typed_copy','cuda':(root/f'typed-copy-{name}.cu').read_text(),'reads':[0],'writes':1,'grid':1,'block':32}]}
    p=open_program(artifact,backend='cuda',allocate=False,include_paths=['/usr/local/cuda/include'])
    x=torch.linspace(-4,4,32,device='cuda').to(dtype)
    x[0]=-0.0;x[1]=float('inf');x[2]=-float('inf');x[3]=float('nan')
    out=torch.empty_like(x)
    p.launch(stream=torch.cuda.current_stream().cuda_stream,x=x.data_ptr(),out=out.data_ptr())
    torch.cuda.synchronize()
    torch.testing.assert_close(out,x,rtol=0,atol=0,equal_nan=True)
    assert torch.equal(out.view(torch.int16)[4:],x.view(torch.int16)[4:])
    p.close()
    print(f'PASS: {name} NVRTC compile and typed load/store on {torch.cuda.get_device_name()}')
