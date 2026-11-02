#!/usr/bin/env python3
"""Export all dtype/shape fixtures through the same source importer as the corpus."""
import sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
root=p/'sources/gelu-fixture-models-v1';output=p/'sources/gelu-fixtures-v1'
if root.exists() or output.exists():raise ValueError('Preserve original fixtures')
graphs=[]
for dtype in ['float32','float16','bfloat16']:
 for name,shape in [('scalar',[]),('single',[1]),('tail',[2,7]),('wide',[16,256])]:
  graph=f'graphs/{name}-{dtype}';directory=root/graph;directory.mkdir(parents=True);graphs.append(graph)
  (directory/'model.py').write_text('import torch\nclass GraphModule(torch.nn.Module):\n def forward(self,x):\n  exact=torch.nn.functional.gelu(x)\n  return (exact,torch.nn.functional.gelu(x,approximate="tanh"),exact+1)\n')
  (directory/'input_meta.py').write_text('class Input:\n name="in_0"\n shape='+repr(shape)+'\n dtype="torch.'+dtype+'"\n')
  (directory/'weight_meta.py').write_text('')
(root/'task').mkdir();(root/'task/graph_list.txt').write_text('\n'.join(graphs)+'\n')
export_task(root,'task',output)
print('Exported',len(graphs),'GELU programs')
