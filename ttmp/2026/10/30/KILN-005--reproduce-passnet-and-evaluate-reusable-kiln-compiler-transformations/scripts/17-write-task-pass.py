#!/usr/bin/env python3
"""Generate first-task dtype dispatch; fixed supported shape validated by runtime."""
from pathlib import Path
import argparse
p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,required=True);a=p.parse_args();a.directory.mkdir(parents=True,exist_ok=True)
a.directory.joinpath('KilnBatchNorm.py').write_text('''import torch
from runtime import TorchProgram
PROGRAMS = {
    torch.float32: TorchProgram('/work/first-task-fp32.json'),
    torch.float16: TorchProgram('/work/batchnorm-f16.json', include_paths=['/usr/local/cuda/include']),
    torch.bfloat16: TorchProgram('/work/batchnorm-bf16.json', include_paths=['/usr/local/cuda/include']),
}
def pattern(mean, variance, bias, weight, x):
    return torch.nn.functional.dropout(torch.nn.functional.batch_norm(torch.nn.functional.relu(x, inplace=False),mean,variance,weight,bias,False,0.1,1e-5),p=0.0,training=False)
def replacement_args(mean, variance, bias, weight, x):
    return (mean, variance, bias, weight, x)
@torch.fx.wrap
def kiln_batch_norm(mean, variance, bias, weight, x):
    return PROGRAMS[x.dtype](mean, variance, bias, weight, x)['out0']
def replacement_func():
    return kiln_batch_norm
''')
a.directory.joinpath('sorted_output_pass_rule_names.json').write_text('["KilnBatchNorm"]\n')
