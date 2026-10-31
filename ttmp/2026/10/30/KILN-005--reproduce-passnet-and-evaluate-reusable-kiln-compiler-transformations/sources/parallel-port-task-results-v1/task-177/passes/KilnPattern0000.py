from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_0, in_2):
    conv2d = torch.conv2d(in_3, in_1, in_0, (1, 1), (0, 0), (1, 1), 1)
    in_3 = in_1 = in_0 = None
    tmp_3 = conv2d + 1.0
    conv2d = None
    tmp_4 = tmp_3 / 2.0
    tmp_3 = None
    tmp_5 = tmp_4.clamp_(0.0, 1.0)
    tmp_4 = None
    tmp_6 = in_2 * tmp_5
    in_2 = tmp_5 = None
    return tmp_6
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_0, in_2):
 return (in_3, in_1, in_0, in_2, 0)
def replacement_func():
 return kiln_generated
