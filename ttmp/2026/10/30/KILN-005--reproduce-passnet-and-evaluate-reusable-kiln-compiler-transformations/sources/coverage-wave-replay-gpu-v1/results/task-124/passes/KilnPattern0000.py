from operator import iadd as kiln_iadd
import torch
from torch import inf

def pattern(in_3, in_5, in_4, in_2, in_0, in_1):
    tmp_2 = in_3.pow_(-0.5)
    tmp_3 = tmp_2.__eq__(inf)
    tmp_4 = tmp_2.masked_fill_(tmp_3, 0)
    tmp_5 = tmp_2[in_5]
    tmp_6 = tmp_5 * in_4
    tmp_7 = tmp_2[in_2]
    tmp_8 = tmp_6 * tmp_7
    linear = torch.nn.functional.linear(in_0, in_1, None)
    return (tmp_8, linear, tmp_4)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_5, in_4, in_2, in_0, in_1):
 return (in_3, in_5, in_4, in_2, in_0, in_1, 0)
def replacement_func():
 return kiln_generated
