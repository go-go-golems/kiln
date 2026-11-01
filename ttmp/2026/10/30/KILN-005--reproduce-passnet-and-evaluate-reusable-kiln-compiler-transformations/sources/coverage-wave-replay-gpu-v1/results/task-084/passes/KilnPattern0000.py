from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_2, in_0):
    tmp_1 = in_1.norm(p=2, dim=-1, keepdim=True)
    tmp_2 = in_1 / tmp_1
    tmp_3 = in_2.norm(p=2, dim=-1, keepdim=True)
    tmp_4 = in_2 / tmp_3
    tmp_5 = in_0.exp()
    tmp_6 = tmp_5 * tmp_4
    return (tmp_6, tmp_4, tmp_2)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_2, in_0):
 return (in_1, in_2, in_0, 0)
def replacement_func():
 return kiln_generated
