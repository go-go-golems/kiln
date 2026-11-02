#!/usr/bin/env python3
"""Literal slice-pattern family, one shared manifest-based CUDA callable."""
import argparse,ast,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args()
directory=a.root/'fifth-task';manifest=json.loads((directory/'manifest.json').read_text());stops=set()
for record in manifest['variants']:
 source=(a.root/'upstream'/record['graph']/'model.py').read_text()
 bounds={node.args[1].value for node in ast.walk(ast.parse(source)) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='slice' and len(node.args)==3 and isinstance(node.args[1],ast.Constant) and type(node.args[1].value) is int}
 if len(bounds)!=1 or len(record['inputs'])!=2:raise ValueError('Unexpected task structure')
 stop=bounds.pop();stops.add(stop);record['specialization']=[stop]
(directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
out=a.root/'fifth-task-pass';out.mkdir(exist_ok=True)
(out/'_kiln_fifth_runtime.py').write_text('''from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/fifth-task',include_paths=['/usr/local/cuda/include'])
def kiln_concat_mean(x,y,stop):
 return DISPATCH(x,y,specialization=(stop,))
''')
names=[]
for stop in sorted(stops):
 name=f'KilnConcatMean{stop}';names.append(name)
 (out/(name+'.py')).write_text(f'''import torch
from _kiln_fifth_runtime import kiln_concat_mean
def pattern(x,y):
 value=torch.cat([x,y],dim=1)[:, :{stop}, :, :]
 return value,value.mean((2,3),keepdim=True)
def replacement_args(x,y):
 return (x,y,{stop})
def replacement_func():
 return kiln_concat_mean
''')
(out/'sorted_output_pass_rule_names.json').write_text(json.dumps(names)+'\n')
print(len(manifest['variants']),'variants;',len(names),'literal pattern specializations',sorted(stops))
