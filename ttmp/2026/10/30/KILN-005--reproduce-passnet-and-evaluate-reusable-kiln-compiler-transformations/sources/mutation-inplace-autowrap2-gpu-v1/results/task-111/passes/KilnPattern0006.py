from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_0, in_1):
    conv2d = torch.conv2d(in_2, in_0, None, (1, 1), (32, 0), (1, 1), 4)
    in_1 = kiln_iadd(in_1, conv2d)
    in_3 = in_1
    tmp_3 = in_3.permute(0, 2, 1, 3)
    tmp_4 = tmp_3.contiguous()
    tmp_5 = tmp_4.view(1, 64, 32)
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_0, in_1):
 return (in_2, in_0, in_1, 6)
def replacement_func():
 return kiln_generated
