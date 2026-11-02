#!/usr/bin/env python3
"""Dispatch compiled variants by actual tensor shape/dtype and input count."""
from pathlib import Path
import argparse,json
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args()
manifest=json.loads((a.root/'fourth-task/manifest.json').read_text());entries={}
for r in manifest['variants']:
 key=tuple((tuple(shape),r['input_dtypes'][name]) for name,shape in r['inputs'].items())
 entries.setdefault(key,'/work/fourth-task/'+Path(r['script']).with_suffix('.json').name)
out=a.root/'fourth-task-pass';out.mkdir(exist_ok=True)
lines=['import torch','from operator import iadd','from runtime import TorchProgram','PROGRAMS = {']
for key,path in entries.items():lines.append(f'    {key!r}: TorchProgram({path!r}, include_paths=["/usr/local/cuda/include"]),')
lines+=['}', 'def pattern(x,y,z):','    value=y+z','    value=iadd(value,x)','    return value,value.mean((2,3),keepdim=True)','def replacement_args(x,y,z):','    return (x,y,z)','@torch.fx.wrap','def kiln_residual_mean(x,y,z):','    tensors=[]','    for value in (x,y,z):','        if isinstance(value,torch.Tensor):','            tensors.append(value)','        elif value != 0:','            raise ValueError("Only captured zero scalar additions supported")','    names={torch.float32:"f32",torch.float16:"f16",torch.bfloat16:"bf16"}','    key=tuple((tuple(value.shape),names[value.dtype]) for value in tensors)','    result=PROGRAMS[key](*tensors)','    return result["out0"],result["out1"]','def replacement_func():','    return kiln_residual_mean']
(out/'KilnResidualMean.py').write_text('\n'.join(lines)+'\n')
(out/'sorted_output_pass_rule_names.json').write_text('["KilnResidualMean"]\n')
print(len(entries),'unique dispatch keys')
