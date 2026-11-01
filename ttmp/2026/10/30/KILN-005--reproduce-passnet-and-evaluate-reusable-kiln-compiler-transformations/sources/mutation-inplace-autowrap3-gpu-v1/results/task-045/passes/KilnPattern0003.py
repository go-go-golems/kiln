from operator import iadd as kiln_iadd
import torch

def pattern(in_0):
    tmp_0 = torch.nn.functional.hardtanh(in_0, 0.0, 6.0, True)
    tmp_1 = torch.nn.functional.adaptive_avg_pool2d(tmp_0, (1, 1))
    tmp_2 = tmp_1.view(64, -1)
    tmp_3 = torch.flatten(tmp_2, 1)
    return tmp_3
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 3)
def replacement_func():
 return kiln_generated
