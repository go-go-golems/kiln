from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_0, in_2):
    tmp_2 = in_3.contiguous()
    in_3 = None
    tmp_3 = tmp_2.view(-1, 64, 64, 384)
    tmp_2 = None
    tmp_4 = torch.roll(tmp_3, shifts=(4, 4), dims=(1, 2))
    tmp_3 = None
    tmp_5 = tmp_4.view(1, 4096, 384)
    tmp_4 = None
    tmp_6 = torch.nn.functional.layer_norm(tmp_5, (384,), in_1, in_0, 1e-05)
    tmp_5 = in_1 = in_0 = None
    tmp_7 = in_2 + tmp_6
    in_2 = tmp_6 = None
    return tmp_7
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_0, in_2):
 return (in_3, in_1, in_0, in_2, 1)
def replacement_func():
 return kiln_generated
