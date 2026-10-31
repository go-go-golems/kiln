from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_2, in_0):
    tmp_0 = in_1 + in_2
    in_1 = in_2 = None
    tmp_0 = kiln_iadd(tmp_0, in_0)
    tmp_1 = tmp_0
    tmp_0 = in_0 = None
    tmp_2 = tmp_1.mean((2, 3), keepdim=True)
    return (tmp_1, tmp_2)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_2, in_0):
 return (in_1, in_2, in_0, 1)
def replacement_func():
 return kiln_generated
