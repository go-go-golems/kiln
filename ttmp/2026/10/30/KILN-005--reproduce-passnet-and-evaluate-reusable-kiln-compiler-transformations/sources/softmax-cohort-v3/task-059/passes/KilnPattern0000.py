from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_0, in_1):
    tmp_1 = in_2.softmax(dim=-1)
    in_2 = None
    tmp_2 = in_0.view(1, -1, 1, 1)
    in_0 = None
    tmp_3 = torch.sigmoid(tmp_2)
    tmp_4 = 1.0 - tmp_3
    tmp_3 = None
    tmp_5 = tmp_4 * in_1
    tmp_4 = in_1 = None
    tmp_6 = torch.sigmoid(tmp_2)
    tmp_2 = None
    tmp_7 = tmp_6 * tmp_1
    tmp_6 = tmp_1 = None
    tmp_8 = tmp_5 + tmp_7
    tmp_5 = tmp_7 = None
    return tmp_8
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_0, in_1):
 return (in_2, in_0, in_1, 0)
def replacement_func():
 return kiln_generated
