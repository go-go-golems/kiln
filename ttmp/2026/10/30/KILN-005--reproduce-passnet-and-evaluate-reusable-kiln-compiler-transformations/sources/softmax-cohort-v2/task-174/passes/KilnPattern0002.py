from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.conv2d(in_2, tmp_1, tmp_0, (1, 1), (0, 0), (1, 1), 1)
    tmp_1 = tmp_0 = None
    tmp_3 = tmp_2.view(24, 1, -1)
    tmp_2 = None
    tmp_4 = tmp_3.softmax(dim=-1)
    tmp_3 = None
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 2)
def replacement_func():
 return kiln_generated
