#!/usr/bin/env python3
"""Generate deterministic independent PyTorch CPU oracle fixtures."""
import json
from pathlib import Path
import torch
TICKET=Path(__file__).resolve().parents[1]
REPO=next(p for p in TICKET.parents if (p/'packages/kiln').exists())
torch.manual_seed(42)
cases=[]
for shape,weight,options in [([1,2,5,6],[3,2,3,2],{}),([2,4,5,5],[6,2,3,3],{'groups':2,'padding':1,'stride':2}),([1,3,6,7],[3,1,2,3],{'groups':3,'dilation':[2,1],'padding':[1,2]})]:
 x=torch.randn(shape);w=torch.randn(weight);b=torch.randn(weight[0]);y=torch.nn.functional.conv2d(x,w,b,**options)
 cases.append({'input':{'shape':shape,'data':x.flatten().tolist()},'weight':{'shape':weight,'data':w.flatten().tolist()},'bias':{'shape':[weight[0]],'data':b.tolist()},'options':options,'output':{'shape':list(y.shape),'data':y.flatten().tolist()}})
out=REPO/'packages/kiln/test/fixtures';out.mkdir(exist_ok=True)
(out/'conv2d-pytorch.json').write_text(json.dumps({'torch_version':torch.__version__,'seed':42,'cases':cases},separators=(',',':'))+'\n')
