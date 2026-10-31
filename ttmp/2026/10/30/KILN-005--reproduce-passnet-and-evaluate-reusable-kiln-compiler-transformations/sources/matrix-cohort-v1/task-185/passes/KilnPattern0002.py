from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    linear = torch.nn.functional.linear(in_2, in_1, in_0)
    in_2 = in_1 = in_0 = None
    tmp_3 = torch.nn.functional.dropout(linear, 0.0, False, False)
    linear = None
    tmp_4 = tmp_3.transpose(1, 2)
    return (tmp_4, tmp_3)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 2)
def replacement_func():
 return kiln_generated
