from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0, in_3):
    tmp_2 = torch.nn.functional.relu(in_2, inplace=False)
    in_2 = None
    tmp_3 = in_1 * tmp_2
    in_1 = tmp_2 = None
    tmp_4 = tmp_3 + in_0
    tmp_3 = in_0 = None
    tmp_5 = torch.nn.functional.max_pool2d(in_3, 2, 1, 0, 1, ceil_mode=True, return_indices=False)
    in_3 = None
    tmp_6 = torch.cat([tmp_5, tmp_4], dim=1)
    tmp_5 = tmp_4 = None
    return tmp_6
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0, in_3):
 return (in_2, in_1, in_0, in_3, 0)
def replacement_func():
 return kiln_generated
