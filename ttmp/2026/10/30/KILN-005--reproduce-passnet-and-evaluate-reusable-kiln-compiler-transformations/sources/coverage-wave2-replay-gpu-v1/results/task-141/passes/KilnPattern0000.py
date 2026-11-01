from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0, in_3):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.nn.functional.linear(in_2, tmp_1, tmp_0)
    tmp_3 = tmp_2.transpose(-1, -2)
    tmp_4 = in_3 * tmp_3
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0, in_3):
 return (in_2, in_1, in_0, in_3, 0)
def replacement_func():
 return kiln_generated
