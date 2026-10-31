from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    linear = torch.nn.functional.linear(in_2, in_1, in_0)
    in_2 = in_1 = in_0 = None
    tmp_3 = torch.reshape(linear, [-1, 9, 1])
    linear = None
    tmp_4 = torch.softmax(tmp_3, dim=1)
    tmp_3 = None
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
