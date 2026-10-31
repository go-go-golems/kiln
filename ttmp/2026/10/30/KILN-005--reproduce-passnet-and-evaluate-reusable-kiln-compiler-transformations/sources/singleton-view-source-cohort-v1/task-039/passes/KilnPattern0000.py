from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    tmp_0 = in_1 * in_0
    in_1 = in_0 = None
    tmp_1 = torch.sum(tmp_0, dim=1)
    tmp_0 = None
    tmp_2 = tmp_1.unsqueeze(1)
    tmp_1 = None
    tmp_3 = torch.sigmoid(tmp_2)
    tmp_2 = None
    return tmp_3
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 0)
def replacement_func():
 return kiln_generated
