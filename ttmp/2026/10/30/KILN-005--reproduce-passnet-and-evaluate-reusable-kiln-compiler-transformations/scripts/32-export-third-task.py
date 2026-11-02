#!/usr/bin/env python3
"""Source-derived third-task variants; preserve graph identity and input specs."""
import importlib.util
import json
from pathlib import Path
import sys
import torch
from torch.fx import symbolic_trace
TICKET=Path(__file__).resolve().parents[1]
REPO=next(p for p in TICKET.parents if (p/'integrations/passnet/fx_import.py').exists())
sys.path.insert(0,str(REPO/'integrations/passnet'))
from fx_export import export_graph
from fx_import import import_graph
root=TICKET/'sources/upstream'
sample=(root/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()[2]
output=TICKET/'sources/third-task';output.mkdir(exist_ok=True)
records=[]
for i,graph in enumerate((root/sample/'graph_list.txt').read_text().splitlines()):
 def load(name):
  spec=importlib.util.spec_from_file_location(f'graph_{i}_{name}',root/graph/(name+'.py'))
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
 model=load('model').GraphModule()
 meta=[]
 for filename in ['input_meta','weight_meta']:
  for cls in vars(load(filename)).values():
   if isinstance(cls,type) and hasattr(cls,'shape') and hasattr(cls,'name'):meta.append(cls)
 meta.sort(key=lambda cls:int(cls.name.split('_')[-1]))
 inputs=[torch.randn(cls.shape).to(getattr(torch,cls.dtype.split('.')[-1])) for cls in meta]
 imported=import_graph(export_graph(symbolic_trace(model),inputs))
 path=output/f'{i:03d}.kiln.js';path.write_text(imported['script'])
 records.append({'graph':graph,'status':'exported','script':path.name,'inputs':imported['inputs'],'input_dtypes':imported['input_dtypes'],'output_structure':imported['output_structure']})
(output/'manifest.json').write_text(json.dumps({'sample':sample,'variants':records},indent=2)+'\n')
print(f'{len(records)} third-task variants exported')
