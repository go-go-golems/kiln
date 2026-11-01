from operator import iadd as kiln_iadd
import torch
from torch import device

def pattern(in_0):
    tmp_0 = torch.nn.functional.softmax(in_0, dim=1)
    tmp_1 = torch.linspace(0, 4, steps=5, device=device(type='cuda', index=0))
    tmp_2 = tmp_0 * tmp_1
    tmp_3 = tmp_2.sum(dim=1)
    tmp_4 = 5 - tmp_3
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
