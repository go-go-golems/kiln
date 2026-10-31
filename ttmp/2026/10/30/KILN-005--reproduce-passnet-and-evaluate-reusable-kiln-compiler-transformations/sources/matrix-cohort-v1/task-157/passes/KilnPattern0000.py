from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_0, in_2):
    linear = torch.nn.functional.linear(in_3, in_1, in_0)
    in_3 = in_1 = in_0 = None
    tmp_3 = linear.permute(0, 3, 1, 2)
    linear = None
    tmp_4 = in_2.transpose(-2, -1)
    in_2 = None
    return (tmp_3, tmp_4)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_0, in_2):
 return (in_3, in_1, in_0, in_2, 0)
def replacement_func():
 return kiln_generated
