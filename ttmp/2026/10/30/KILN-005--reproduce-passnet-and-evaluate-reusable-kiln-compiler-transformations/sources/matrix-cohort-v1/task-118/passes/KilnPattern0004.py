from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    linear = torch.nn.functional.linear(in_2, in_1, in_0)
    in_2 = in_1 = in_0 = None
    tmp_3 = linear.permute(0, 2, 1)
    linear = None
    tmp_4 = tmp_3.reshape(24, -1, 16, 16)
    tmp_3 = None
    tmp_5 = torch.nn.functional.interpolate(tmp_4, size=(128, 128), mode='bilinear', align_corners=False)
    tmp_4 = None
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 4)
def replacement_func():
 return kiln_generated
