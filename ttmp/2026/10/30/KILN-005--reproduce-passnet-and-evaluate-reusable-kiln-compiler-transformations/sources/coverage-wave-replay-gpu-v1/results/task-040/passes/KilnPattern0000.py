from operator import iadd as kiln_iadd, itruediv as kiln_itruediv
import torch
from torch import device

def pattern(in_0):
    tmp_0 = torch.tensor(256, dtype=torch.float32, device=device(type='cuda', index=0))
    tmp_1 = torch.tensor(0.5, device=device(type='cuda', index=0))
    tmp_2 = tmp_0 ** tmp_1
    in_0 = kiln_itruediv(in_0, tmp_2)
    tmp_3 = in_0
    tmp_4 = torch.tensor(0.05, device=device(type='cuda', index=0))
    tmp_3 = kiln_itruediv(tmp_3, tmp_4)
    tmp_5 = tmp_3
    tmp_6 = tmp_5.softmax(dim=-1)
    return tmp_6
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
