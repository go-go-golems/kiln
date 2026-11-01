from operator import iadd as kiln_iadd
import torch

def pattern(in_10, in_8, in_7):
    conv2d = torch.conv2d(in_10, in_8, in_7, (1, 1), (0, 0), (1, 1), 1)
    tmp_11 = torch.nn.functional.interpolate(conv2d, size=(512, 512), mode='bilinear', align_corners=False)
    return tmp_11
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_10, in_8, in_7):
 return (in_10, in_8, in_7, 0)
def replacement_func():
 return kiln_generated
