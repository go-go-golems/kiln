#!/usr/bin/env python3
"""Produce end-to-end source fixtures for stable source softmax contracts."""
import sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
root=p/'sources/softmax-probe-models';output=p/'sources/softmax-fixtures'
if root.exists() or output.exists():raise ValueError('Preserve previous fixtures')
graphs=[]
cases=[('function',[2,3,7],'torch.softmax(x,dim=-1)'),('middle',[2,3,7],'torch.nn.functional.softmax(input=x,dim=1)'),('first',[2,3,7],'x.softmax(0)'),('aten',[2,3,7],'torch.ops.aten.softmax.int(x,-1,None)'),('internal',[2,3,7],'torch.ops.aten._softmax.default(x,-1,False)'),('implicit',[2,3,7],'torch.nn.functional.softmax(x)'),('vector',[17],'x.softmax(dim=-1)'),('scalar',[],'torch.softmax(x,0)'),('widen',[2,3,7],'torch.softmax(x,-1,dtype=torch.float32)'),('narrow',[2,3,7],'torch.softmax(x,-1,dtype=torch.float16)'),('mutation',[2,3,7],'torch.nn.functional.relu(torch.softmax(x,-1),inplace=True)')]
for dtype in ['float32','float16','bfloat16']:
 for name,shape,call in cases:
  graph=f'graphs/{name}-{dtype}';directory=root/graph;directory.mkdir(parents=True);graphs.append(graph)
  (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x):\n  return ('+call+',)\n')
  (directory/'input_meta.py').write_text('class Input:\n name="in_0"\n shape='+repr(shape)+'\n dtype="torch.'+dtype+'"\n')
  (directory/'weight_meta.py').write_text('')
(root/'task').mkdir();(root/'task/graph_list.txt').write_text('\n'.join(graphs)+'\n')
export_task(root,'task',output)
