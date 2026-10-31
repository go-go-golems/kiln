from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    conv2d = torch.conv2d(in_1, in_0, None, (1, 1), (1, 1), (1, 1), 1)
    in_1 = in_0 = None
    tmp_2 = torch.nn.functional.max_pool2d(conv2d, 3, 2, 1, 1, ceil_mode=False, return_indices=False)
    conv2d = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 1)
def replacement_func():
 return kiln_generated
