from operator import iadd as kiln_iadd
import torch

def pattern(in_1):
    tmp_0 = torch.nn.functional.silu(in_1, inplace=True)
    tmp_1 = tmp_0.mean((2, 3))
    tmp_4 = tmp_1.view(1, 1, -1)
    return (tmp_0, tmp_4)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1):
 return (in_1, 0)
def replacement_func():
 return kiln_generated
