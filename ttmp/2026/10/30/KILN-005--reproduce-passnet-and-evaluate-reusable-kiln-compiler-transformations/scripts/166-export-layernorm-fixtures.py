#!/usr/bin/env python3
"""Export independent LayerNorm forms through the actual FX importer."""
import json,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
root=p/'sources/layernorm-probe-models';out=p/'sources/layernorm-fixtures'
if root.exists() or out.exists():raise ValueError('Preserve existing or partial fixture set')
root.mkdir();graphs=[]
forms=[('vector',[17],[17],True,True),('odd-batch',[2,3,129],[129],True,True),('multi-dim',[2,3,5],[3,5],True,True),('no-affine',[3,33],[33],False,False),('weight-only',[2,17],[17],True,False),('bias-only',[2,17],[17],False,True),('full-shape',[2,3],[2,3],True,True)]
for name,shape,normalized,weight,bias in forms:
 for dtype in ['float32','float16','bfloat16']:
  graph='graphs/'+name+'-'+dtype;directory=root/graph;directory.mkdir(parents=True);graphs.append(graph)
  args=['x']+(['w'] if weight else [])+(['b'] if bias else [])
  call='torch.nn.functional.layer_norm(x,'+repr(tuple(normalized))+','+('w' if weight else 'None')+','+('b' if bias else 'None')+',1e-5)'
  (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,'+','.join(args)+'):\n  return ('+call+',)\n')
  (directory/'input_meta.py').write_text('class Input:\n name="in_0"\n shape='+repr(shape)+'\n dtype="torch.'+dtype+'"\n')
  text=''
  for index,key in enumerate(args[1:],1):text+='class Meta'+str(index)+':\n name="in_'+str(index)+'"\n shape='+repr(normalized)+'\n dtype="torch.'+dtype+'"\n'
  (directory/'weight_meta.py').write_text(text)
(root/'task').mkdir();(root/'task/graph_list.txt').write_text('\n'.join(graphs)+'\n')
export_task(root,'task',out)
