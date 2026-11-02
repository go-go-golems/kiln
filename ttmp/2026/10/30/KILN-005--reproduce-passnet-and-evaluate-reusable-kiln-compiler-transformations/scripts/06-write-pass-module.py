#!/usr/bin/env python3
"""Create a reviewable PassBench integration pass. No evaluator modifications."""
import argparse
from pathlib import Path
import json
p=argparse.ArgumentParser()
p.add_argument('--directory',type=Path,required=True)
p.add_argument('--artifact',required=True)
a=p.parse_args(); a.directory.mkdir(parents=True,exist_ok=True)
source='''import torch
from runtime import TorchProgram
PROGRAM = TorchProgram(ARTIFACT)

def pattern(mean, variance, bias, weight, x):
    return torch.nn.functional.dropout(torch.nn.functional.batch_norm(torch.nn.functional.relu(x, inplace=False), mean, variance, weight, bias, False, 0.1, 1e-5), p=0.0, training=False)

def replacement_args(mean, variance, bias, weight, x):
    return (mean, variance, bias, weight, x)

@torch.fx.wrap
def kiln_batch_norm(mean, variance, bias, weight, x):
    return PROGRAM(mean, variance, bias, weight, x)['out0']

def replacement_func():
    return kiln_batch_norm
'''.replace('ARTIFACT',repr(a.artifact))
(a.directory/'KilnBatchNorm.py').write_text(source)
(a.directory/'sorted_output_pass_rule_names.json').write_text(json.dumps(['KilnBatchNorm']))
