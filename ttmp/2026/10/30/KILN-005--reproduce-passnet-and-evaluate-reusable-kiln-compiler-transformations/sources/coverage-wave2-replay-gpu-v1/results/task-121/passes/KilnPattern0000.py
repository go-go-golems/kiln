from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    tmp_3 = torch.nn.functional.dropout(in_2, 0.1, False, False)
    linear = torch.nn.functional.linear(tmp_3, in_1, in_0)
    return linear
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
