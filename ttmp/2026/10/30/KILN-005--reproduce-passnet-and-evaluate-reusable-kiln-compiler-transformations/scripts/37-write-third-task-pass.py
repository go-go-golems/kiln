#!/usr/bin/env python3
import argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args()
out=a.root/'third-task-pass';out.mkdir(exist_ok=True)
out.joinpath('KilnConvResize.py').write_text('''import torch
from runtime import TorchProgram
PROGRAM=TorchProgram('/work/third-task/bias-fixed.json',include_paths=['/usr/local/cuda/include'])
def pattern(bias,weight,residual,x):
    conv=torch.conv2d(x,weight,bias,(2,2),(1,1),(1,1),1)
    relu=torch.nn.functional.relu(conv,inplace=True)
    return torch.nn.functional.interpolate(residual+relu,size=(24,24),mode='bilinear',align_corners=False)
def replacement_args(bias,weight,residual,x):
    return (bias,weight,residual,x)
@torch.fx.wrap
def kiln_conv_resize(bias,weight,residual,x):
    return PROGRAM(bias,weight,residual,x)['out0']
def replacement_func():
    return kiln_conv_resize
''')
out.joinpath('sorted_output_pass_rule_names.json').write_text('["KilnConvResize"]\n')
