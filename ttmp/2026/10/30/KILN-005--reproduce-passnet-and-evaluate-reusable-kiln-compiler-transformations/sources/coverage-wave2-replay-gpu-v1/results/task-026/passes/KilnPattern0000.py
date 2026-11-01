from operator import iadd as kiln_iadd
import torch
from torch import device

def pattern():
    tmp_0 = torch.arange(1, device=device(type='cuda', index=0))
    return tmp_0
from _kiln_generated_runtime import kiln_generated
def replacement_args():
 return (, 0)
def replacement_func():
 return kiln_generated
