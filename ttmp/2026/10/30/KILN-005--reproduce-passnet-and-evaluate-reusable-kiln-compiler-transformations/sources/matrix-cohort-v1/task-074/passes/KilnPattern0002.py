from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0, in_3):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.nn.functional.linear(in_2, tmp_1, tmp_0)
    tmp_1 = tmp_0 = None
    tmp_3 = torch.sigmoid(tmp_2)
    tmp_2 = None
    tmp_4 = tmp_3.view(128, 64, 1, 1)
    tmp_3 = None
    tmp_5 = in_3 * tmp_4
    tmp_4 = None
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0, in_3):
 return (in_2, in_1, in_0, in_3, 2)
def replacement_func():
 return kiln_generated
