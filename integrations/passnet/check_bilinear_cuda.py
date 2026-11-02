"""Compare exported bilinear kernels with actual PyTorch CUDA interpolation."""
from pathlib import Path
import json,sys
import torch
from runtime import TorchProgram
root=Path(sys.argv[1]);fixtures=json.loads((root/'kiln/packages/kiln/test/fixtures/bilinear-pytorch.json').read_text())
for i in range(len(fixtures['cases'])):assert (root/'bilinear'/f'{i:03d}.json').exists()
for i,c in enumerate(fixtures['cases']):
 x=torch.tensor(c['input'],device='cuda',dtype=torch.float32).reshape(c['shape'])
 p=TorchProgram(root/'bilinear'/f'{i:03d}.json')
 actual=p(x)['out'];expected=torch.nn.functional.interpolate(x,size=c['size'],mode='bilinear',align_corners=False)
 torch.testing.assert_close(actual,expected,rtol=1.3e-6,atol=1e-5)
 torch.cuda.synchronize();p.close()
 print(f'PASS: bilinear {i}, max_abs_error={(actual-expected).abs().max().item()}',flush=True)
