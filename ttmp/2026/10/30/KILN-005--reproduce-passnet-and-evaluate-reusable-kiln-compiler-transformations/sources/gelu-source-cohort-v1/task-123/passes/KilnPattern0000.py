from operator import iadd as kiln_iadd
import torch

def pattern(in_0):
    tmp_0 = torch.nn.functional.gelu(in_0)
    in_0 = None
    tmp_1 = tmp_0.mean((2, 3), keepdim=True)
    return (tmp_0, tmp_1)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
