from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_0, in_1):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.nn.functional.relu(in_2, inplace=False)
    tmp_3 = torch.nn.functional.avg_pool2d(tmp_2, 3, 1, 1, False, False, None)
    tmp_4 = tmp_3 - tmp_2
    tmp_3 = None
    tmp_5 = tmp_0.unsqueeze(-1)
    tmp_0 = None
    tmp_6 = tmp_5.unsqueeze(-1)
    tmp_5 = None
    tmp_7 = tmp_6 * tmp_4
    tmp_6 = tmp_4 = None
    tmp_8 = tmp_2 + tmp_7
    tmp_2 = tmp_7 = None
    tmp_9 = tmp_1.unsqueeze(-1)
    tmp_1 = None
    tmp_10 = tmp_9.unsqueeze(-1)
    tmp_9 = None
    return (tmp_8, tmp_10)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_0, in_1):
 return (in_2, in_0, in_1, 0)
def replacement_func():
 return kiln_generated
