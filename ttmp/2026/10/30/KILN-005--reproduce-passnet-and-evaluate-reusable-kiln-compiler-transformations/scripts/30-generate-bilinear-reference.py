#!/usr/bin/env python3
from pathlib import Path
import torch,json
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'packages/kiln').exists())
torch.manual_seed(42);cases=[]
for shape,size in [([1,2,3,4],[7,6]),([1,1,7,5],[2,3]),([1,1,1,1],[3,4]),([2,1,3,5],[3,5])]:
 x=torch.randn(shape);y=torch.nn.functional.interpolate(x,size=size,mode='bilinear',align_corners=False)
 cases.append({'shape':shape,'size':size,'input':x.flatten().tolist(),'output':y.flatten().tolist()})
(repo/'packages/kiln/test/fixtures/bilinear-pytorch.json').write_text(json.dumps({'torch_version':torch.__version__,'cases':cases},separators=(',',':'))+'\n')
