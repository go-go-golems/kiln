#!/usr/bin/env python3
"""Exercise shared transpose binding through actual FX export/import."""
import sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
root=p/'sources/transpose-probe-models';output=p/'sources/transpose-fixtures'
if root.exists() or output.exists():raise ValueError('Preserve previous fixtures')
graphs=[]
for dtype in ['float32','float16','bfloat16']:
 for kind in ['function','keywords','method','aten','matmul']:
  for label,shape in ([('batch',[2,3,4])] if kind=='matmul' else [('batch',[2,3,4]),('vector',[5]),('scalar',[])]):
   graph=f'graphs/{kind}-{label}-{dtype}';directory=root/graph;directory.mkdir(parents=True);graphs.append(graph)
   call={'function':'torch.transpose(x,-1,0)','keywords':'torch.transpose(input=x,dim0=-1,dim1=0)',
         'method':'x.transpose(dim0=-1,dim1=0)','aten':'torch.ops.aten.transpose.int(x,-1,0)',
         'matmul':'torch.matmul(x,torch.transpose(y,-1,-2))'}[kind]
   (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x'+(',y' if kind=='matmul' else '')+'):\n  return ('+call+',)\n')
   (directory/'input_meta.py').write_text('class Input:\n name="in_0"\n shape='+repr(shape)+'\n dtype="torch.'+dtype+'"\n')
   (directory/'weight_meta.py').write_text('class Other:\n name="in_1"\n shape=[2,5,4]\n dtype="torch.'+dtype+'"\n' if kind=='matmul' else '')
(root/'task').mkdir();(root/'task/graph_list.txt').write_text('\n'.join(graphs)+'\n')
export_task(root,'task',output)
