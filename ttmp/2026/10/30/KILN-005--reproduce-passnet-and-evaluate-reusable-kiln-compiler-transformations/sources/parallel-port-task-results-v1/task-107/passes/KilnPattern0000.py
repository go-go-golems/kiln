from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    conv2d = torch.conv2d(in_1, in_0, None, (2, 2), (3, 3), (1, 1), 1)
    in_1 = in_0 = None
    tmp_3 = torch.nn.functional.max_pool2d(conv2d, 3, 2, 1, 1, ceil_mode=False, return_indices=False)
    conv2d = None
    return tmp_3
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 0)
def replacement_func():
 return kiln_generated
