from operator import iadd as kiln_iadd
import torch

def pattern(in_1):
    tmp_0 = torch.nn.functional.relu(in_1, inplace=True)
    tmp_3 = tmp_0.mean((2, 3), keepdim=True)
    return (tmp_0, tmp_3)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1):
 return (in_1, 0)
def replacement_func():
 return kiln_generated
