from operator import iadd as kiln_iadd
import torch
from torch import device

def pattern(in_1, in_0, in_3, in_2):
    tmp_4 = torch.arange(0, 9, dtype=torch.int64, device=device(type='cuda', index=0))
    tmp_5 = tmp_4.unsqueeze(0)
    tmp_5 = kiln_iadd(tmp_5, 2)
    tmp_6 = tmp_5
    tmp_7 = tmp_6.view(-1)
    tmp_8 = in_1.index_select(0, tmp_7)
    tmp_9 = tmp_8.view(1, 9, 2048)
    tmp_10 = tmp_9.detach()
    tmp_11 = tmp_10.to(device(type='cuda', index=0))
    tmp_12 = in_0 + tmp_11
    tmp_13 = torch.nn.functional.dropout(tmp_12, p=0.1, training=False)
    tmp_14 = torch.nn.functional.layer_norm(tmp_13, (2048,), in_3, in_2, 1e-05)
    return (tmp_13, tmp_14)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0, in_3, in_2):
 return (in_1, in_0, in_3, in_2, 1)
def replacement_func():
 return kiln_generated
