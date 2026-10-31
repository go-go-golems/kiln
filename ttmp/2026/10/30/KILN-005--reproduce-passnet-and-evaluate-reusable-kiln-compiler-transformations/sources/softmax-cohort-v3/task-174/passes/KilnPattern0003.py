from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    conv2d = torch.conv2d(in_2, in_1, in_0, (1, 1), (0, 0), (1, 1), 1)
    in_2 = in_1 = in_0 = None
    tmp_3 = conv2d.view(32, 1, -1)
    conv2d = None
    tmp_4 = tmp_3.softmax(dim=-1)
    tmp_3 = None
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 3)
def replacement_func():
 return kiln_generated
