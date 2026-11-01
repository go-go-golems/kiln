from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    linear = torch.nn.functional.linear(in_1, in_0, None)
    tmp_2 = linear.reshape(1, 197, 3, 4, 48)
    tmp_3 = tmp_2.permute(2, 0, 3, 1, 4)
    unbind = tmp_3.unbind(0)
    tmp_5 = unbind[0]
    tmp_6 = unbind[1]
    tmp_7 = unbind[2]
    tmp_8 = tmp_6.transpose(-2, -1)
    return (tmp_5, tmp_8, tmp_7)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 1)
def replacement_func():
 return kiln_generated
