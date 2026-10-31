from operator import iadd as kiln_iadd
import torch

def pattern(in_5, in_4, in_0, in_1, in_3, in_2):
    tmp_4 = torch.nn.functional.max_pool2d(in_5, 2, 2, 0, 1, ceil_mode=False, return_indices=False)
    in_5 = None
    tmp_5 = torch.nn.functional.interpolate(tmp_4, (64, 64), None, 'bilinear', False)
    tmp_4 = None
    tmp_6 = torch.cat([in_4, tmp_5], 1)
    in_4 = tmp_5 = None
    tmp_7 = torch.nn.functional.batch_norm(tmp_6, in_0, in_1, in_3, in_2, False, 0.1, 0.001)
    tmp_6 = in_0 = in_1 = in_3 = in_2 = None
    tmp_8 = torch.nn.functional.relu(tmp_7, inplace=False)
    tmp_7 = None
    return tmp_8
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_5, in_4, in_0, in_1, in_3, in_2):
 return (in_5, in_4, in_0, in_1, in_3, in_2, 0)
def replacement_func():
 return kiln_generated
