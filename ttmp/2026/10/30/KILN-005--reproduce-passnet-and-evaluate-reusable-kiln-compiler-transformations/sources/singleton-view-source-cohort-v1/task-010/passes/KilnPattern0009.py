from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.conv2d(in_2, tmp_1, tmp_0, (1, 1), (0, 0), (1, 1), 1)
    tmp_1 = tmp_0 = None
    tmp_3 = tmp_2.view(24, 1, 4096)
    tmp_2 = None
    tmp_4 = torch.nn.functional.softmax(tmp_3, 2, _stacklevel=5)
    tmp_3 = None
    tmp_5 = tmp_4.unsqueeze(-1)
    tmp_4 = None
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 9)
def replacement_func():
 return kiln_generated
