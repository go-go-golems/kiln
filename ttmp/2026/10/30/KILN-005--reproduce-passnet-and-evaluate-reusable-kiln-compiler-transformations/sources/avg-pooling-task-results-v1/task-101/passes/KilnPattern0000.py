from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    tmp_0 = in_0
    tmp_1 = torch.conv2d(in_1, tmp_0, None, (1, 1), (0, 0), (1, 1), 1)
    tmp_0 = None
    tmp_2 = torch.nn.functional.avg_pool2d(tmp_1, 2, 2, 0, False, True, None)
    tmp_1 = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 0)
def replacement_func():
 return kiln_generated
