from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1):
    tmp_0 = torch.nn.functional.adaptive_avg_pool2d(in_0, (32, 24))
    in_0 = None
    tmp_1 = torch.cat([tmp_0, in_1], dim=1)
    tmp_0 = in_1 = None
    return tmp_1
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1):
 return (in_0, in_1, 0)
def replacement_func():
 return kiln_generated
