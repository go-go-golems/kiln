from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_0, in_1):
    linear = torch.nn.functional.linear(in_2, in_0, None)
    in_2 = in_0 = None
    tmp_2 = in_1 * linear
    in_1 = linear = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_0, in_1):
 return (in_2, in_0, in_1, 1)
def replacement_func():
 return kiln_generated
