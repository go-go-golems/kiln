"""Generate small independent PyTorch expand/unfold value fixtures."""
import json,torch
from pathlib import Path
rows=[]
for dtype in (torch.float32,torch.float16,torch.bfloat16):
 for op,shape,params in [('expand',[2,1,3],{'shape':[2,4,-1]}),('expand',[1,3],{'shape':[2,4,3]}),('unfold',[2,5,4],{'axis':-2,'size':3,'step':2}),('unfold',[3,6],{'axis':1,'size':2,'step':3})]:
  x=torch.arange(1,1+torch.tensor(shape).prod().item(),dtype=torch.float32).reshape(shape).to(dtype)
  y=x.expand(params['shape']) if op=='expand' else x.unfold(params['axis'],params['size'],params['step'])
  rows.append({'op':op,'dtype':str(dtype).split('.')[-1].replace('float32','f32').replace('float16','f16').replace('bfloat16','bf16'),'input':{'shape':shape,'data':x.float().reshape(-1).tolist()},'options':params,'output':{'shape':list(y.shape),'data':y.float().reshape(-1).tolist()}})
p=Path('packages/kiln/test/fixtures/view-batch-pytorch.json');p.write_text(json.dumps({'torch':torch.__version__,'cases':rows},indent=2)+'\n');print(len(rows))
