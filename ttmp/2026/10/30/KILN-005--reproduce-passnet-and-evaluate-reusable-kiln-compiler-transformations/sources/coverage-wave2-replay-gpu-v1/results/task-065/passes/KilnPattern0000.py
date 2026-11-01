from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    tmp_0 = in_0
    tmp_1 = in_2 * in_1
    tmp_2 = tmp_1 + tmp_0
    tmp_3 = torch.unbind(tmp_2, dim=2)
    tmp_4 = tmp_3[0]
    tmp_5 = tmp_3[1]
    tmp_6 = tmp_5.permute(0, 2, 1)
    return (tmp_6, tmp_4)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
