#!/usr/bin/env python3
"""Export source fixtures spanning unit-axis views and contraction epilogues."""
import sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
root=p/'sources/singleton-reshape-probe-models';output=p/'sources/singleton-reshape-fixtures'
if root.exists() or output.exists():raise ValueError('Preserve previous fixtures')
cases=[('scalar-to-units',[],None,'torch.reshape(x,[1,1,1])'),('units-to-scalar',[1,1],None,'x.reshape([])'),('unit-axes',[2,1,3],None,'x.reshape([1,2,3,1])'),('transpose-unit',[2,3],None,'x.transpose(0,1).reshape([1,3,2,1])'),('transpose-general',[2,3],None,'x.transpose(0,1).reshape([6])'),('contraction-small',[2,1,5,7],[2,1,7,3],'torch.matmul(x,y).transpose(1,2).reshape([2,5,1,3]).reshape([2,5,3])'),('contraction-tail',[3,1,17,19],[3,1,19,11],'torch.matmul(x,y).transpose(1,2).reshape([3,17,1,11]).reshape([3,17,11])')]
graphs=[]
for dtype in ['float32','float16','bfloat16']:
 for name,shape,other,call in cases:
  graph=f'graphs/{name}-{dtype}';directory=root/graph;directory.mkdir(parents=True);graphs.append(graph)
  (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x'+(',y' if other is not None else '')+'):\n  return ('+call+',)\n')
  (directory/'input_meta.py').write_text('class Input:\n name="in_0"\n shape='+repr(shape)+'\n dtype="torch.'+dtype+'"\n')
  (directory/'weight_meta.py').write_text('class Other:\n name="in_1"\n shape='+repr(other)+'\n dtype="torch.'+dtype+'"\n' if other is not None else '')
(root/'task').mkdir();(root/'task/graph_list.txt').write_text('\n'.join(graphs)+'\n')
export_task(root,'task',output)
