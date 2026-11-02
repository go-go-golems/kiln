"""Deterministic PyTorch CPU oracles for static adaptive pooling geometry/dtypes."""
import json,math
from pathlib import Path
import torch
cases=[]
for spatial in [(5,7),(6,8),(1,4),(8,3),(2,2)]:
 for batched in [False,True]:
  shape=([2,2] if batched else [2])+list(spatial)
  for size in [1,[2,3],[None,3],[3,None],[7,8],[None,None],list(spatial)]:
   for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
    x=((torch.arange(math.prod(shape))%29-14)/4).reshape(shape).to(dtype)
    y=torch.nn.functional.adaptive_avg_pool2d(x,size)
    cases.append({'input':{'shape':shape,'data':x.flatten().tolist(),'dtype':name},'output_size':size,'output':{'shape':list(y.shape),'data':y.flatten().tolist()}})
p=Path('packages/kiln/test/fixtures/adaptive-avg-pool2d-pytorch.json')
p.write_text(json.dumps({'torch':torch.__version__,'scope':'Deterministic quarter-valued CPU oracles, not arbitrary numerical equivalence','cases':cases},indent=2)+'\n');print(len(cases))
