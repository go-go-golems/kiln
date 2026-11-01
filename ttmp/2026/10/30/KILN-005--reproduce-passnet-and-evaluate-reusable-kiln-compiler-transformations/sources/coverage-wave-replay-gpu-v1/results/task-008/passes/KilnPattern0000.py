from operator import iadd as kiln_iadd, itruediv as kiln_itruediv
import torch

def pattern(in_0):
    tmp_0 = in_0.sum(dim=-1)
    tmp_1 = tmp_0.unsqueeze(-1)
    in_0 = kiln_itruediv(in_0, tmp_1)
    tmp_2 = in_0
    tmp_3 = torch.nn.functional.dropout(tmp_2, 0.0, False, False)
    return tmp_3
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
