#!/usr/bin/env python3
from pathlib import Path
import argparse,json,re
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args()
manifest=json.loads((a.root/'second-task/manifest.json').read_text())
entries={}
for record in manifest['variants']:
 source=a.root/'second-task'/record['script']
 scale=float(re.search(r'N.div\(v0, ([^)]+)\)',source.read_text())[1])
 key=(tuple(record['inputs']['v0']),record['input_dtypes']['v0'],scale)
 entries[key]='/work/second-task/'+source.with_suffix('.json').name
out=a.root/'second-task-pass';out.mkdir(exist_ok=True)
lines=['import torch','from runtime import TorchProgram','PROGRAMS = {']
for key,path in entries.items():lines.append(f'    {key!r}: TorchProgram({path!r}, include_paths=["/usr/local/cuda/include"]),')
lines+=['}', 'def pattern(x, scale):','    return (x / scale).transpose(-1,-2)','def replacement_args(x, scale):','    return (x, scale)','@torch.fx.wrap','def kiln_div_transpose(x, scale):','    dtype = {torch.float32:"f32",torch.float16:"f16",torch.bfloat16:"bf16"}[x.dtype]','    return PROGRAMS[(tuple(x.shape),dtype,scale)](x)["out0"]','def replacement_func():','    return kiln_div_transpose']
(out/'KilnDivTranspose.py').write_text('\n'.join(lines)+'\n')
(out/'sorted_output_pass_rule_names.json').write_text('["KilnDivTranspose"]\n')
print(len(entries),'unique shape/dtype/constant artifacts')
