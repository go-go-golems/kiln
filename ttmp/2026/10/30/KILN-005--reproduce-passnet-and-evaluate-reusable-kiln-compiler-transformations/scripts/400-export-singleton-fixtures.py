#!/usr/bin/env python3
"""Independent source fixtures for singleton layouts, scalars, dtypes and transpose composition."""
import sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').is_dir());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
root=p/'sources/singleton-view-fixture-models-v1';output=p/'sources/singleton-view-fixtures-v1';assert not root.exists() and not output.exists();graphs=[]
for dtype in ['float32','float16','bfloat16']:
 for name,shape in [('scalar',[]),('single',[1]),('interior',[2,1,3,1]),('tail',[16,1,257])]:
  graph=f'graphs/{name}-{dtype}';directory=root/graph;directory.mkdir(parents=True);graphs.append(graph);axes=tuple(i for i,size in enumerate(shape) if size==1)
  transposed='x.transpose(0, -1).unsqueeze(1)' if len(shape)>1 else 'x.unsqueeze(-1)'
  (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x):\n  return (x.unsqueeze(0),torch.unsqueeze(input=x,dim=-1),x.squeeze(),x.squeeze('+repr(axes)+'),torch.squeeze(input=x,dim=0),'+transposed+')\n')
  (directory/'input_meta.py').write_text('class Input:\n name="in_0"\n shape='+repr(shape)+'\n dtype="torch.'+dtype+'"\n');(directory/'weight_meta.py').write_text('')
(root/'task').mkdir();(root/'task/graph_list.txt').write_text('\n'.join(graphs)+'\n');export_task(root,'task',output);print('Exported',len(graphs),'programs with six outputs each')
