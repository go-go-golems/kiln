from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    tmp_0 = torch.softmax(in_1, dim=1)
    in_1 = None
    tmp_1 = in_0 * tmp_0
    in_0 = tmp_0 = None
    tmp_2 = torch.sum(tmp_1, dim=1)
    tmp_1 = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 0)
def replacement_func():
 return kiln_generated
