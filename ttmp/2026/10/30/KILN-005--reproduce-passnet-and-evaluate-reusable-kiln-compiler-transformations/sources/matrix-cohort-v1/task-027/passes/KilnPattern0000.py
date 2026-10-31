from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_0, in_2, in_1):
    linear = torch.nn.functional.linear(in_3, in_0, None)
    in_3 = in_0 = None
    tmp_3 = in_2 * in_1
    in_2 = in_1 = None
    return (tmp_3, linear)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_0, in_2, in_1):
 return (in_3, in_0, in_2, in_1, 0)
def replacement_func():
 return kiln_generated
