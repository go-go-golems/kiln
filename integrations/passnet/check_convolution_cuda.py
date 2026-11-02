"""Check compiler-exported convolution fixtures against PyTorch CUDA."""
from pathlib import Path
import json,sys
import torch
from runtime import TorchProgram
root=Path(sys.argv[1]);repo=root/'kiln'
fixtures=json.loads((repo/'packages/kiln/test/fixtures/conv2d-pytorch.json').read_text())
for i,case in enumerate(fixtures['cases']):
 artifact=root/'convolution'/f'{i:03d}.json'
 assert artifact.exists(), f'Compilation must finish first: {artifact}'
for i,case in enumerate(fixtures['cases']):
 tensors=[torch.tensor(case[key]['data'],device='cuda',dtype=torch.float32).reshape(case[key]['shape']) for key in ['input','weight','bias']]
 p=TorchProgram(root/'convolution'/f'{i:03d}.json')
 actual=p(*tensors)['out'];expected=torch.nn.functional.conv2d(*tensors,**case['options'])
 torch.testing.assert_close(actual,expected,rtol=1.3e-6,atol=1e-5)
 torch.cuda.synchronize();p.close()
 print(f'PASS: convolution fixture {i}, shape={list(actual.shape)}, max_abs_error={(actual-expected).abs().max().item()}',flush=True)
