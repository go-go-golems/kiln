from operator import iadd as kiln_iadd
import torch
from torch import device

def pattern(in_4, in_1, in_0, in_3, in_2):
    tmp_4 = torch.nn.functional.embedding(in_4, in_1, 1, None, 2.0, False, False)
    tmp_5 = tmp_4 * 16.0
    tmp_6 = torch.arange(0, 1, dtype=torch.int64, device=device(type='cuda', index=0))
    tmp_7 = tmp_6.expand(1, -1)
    tmp_8 = tmp_7 + 2
    tmp_9 = torch.nn.functional.embedding(tmp_8, in_0, None, None, 2.0, False, False)
    tmp_10 = tmp_5 + tmp_9
    tmp_11 = torch.nn.functional.layer_norm(tmp_10, (256,), in_3, in_2, 1e-05)
    tmp_12 = torch.nn.functional.dropout(tmp_11, p=0.1, training=False)
    return tmp_12
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_1, in_0, in_3, in_2):
 return (in_4, in_1, in_0, in_3, in_2, 0)
def replacement_func():
 return kiln_generated
