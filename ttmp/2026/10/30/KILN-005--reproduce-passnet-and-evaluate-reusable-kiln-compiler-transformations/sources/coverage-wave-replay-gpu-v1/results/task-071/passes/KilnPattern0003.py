from operator import iadd as kiln_iadd
import torch
from torch import device

def pattern(in_0):
    tmp_0 = in_0
    tmp_1 = torch.arange(0, 256, device=device(type='cuda', index=0))
    tmp_2 = tmp_0.to(device=device(type='cuda', index=0), dtype=torch.bool)
    return (tmp_1, tmp_2)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 3)
def replacement_func():
 return kiln_generated
