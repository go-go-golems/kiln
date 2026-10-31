from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_3, in_1, in_0):
    tmp_2 = torch.nn.functional.gelu(in_2, approximate='none')
    in_2 = None
    tmp_3 = tmp_2.flatten(2)
    tmp_2 = None
    tmp_4 = tmp_3.transpose(1, 2)
    tmp_3 = None
    tmp_5 = tmp_4.contiguous()
    tmp_4 = None
    tmp_6 = in_3 + tmp_5
    in_3 = tmp_5 = None
    tmp_7 = tmp_6.permute(0, 2, 1)
    tmp_6 = None
    tmp_8 = tmp_7.view(1, 128, 16, 12)
    tmp_7 = None
    tmp_9 = tmp_8.view(1, 128, -1)
    tmp_8 = None
    tmp_10 = tmp_9.permute(0, 2, 1)
    tmp_9 = None
    tmp_11 = torch.nn.functional.layer_norm(tmp_10, (128,), in_1, in_0, 1e-06)
    in_1 = in_0 = None
    tmp_12 = tmp_11.view(1, 16, 12, 128)
    tmp_11 = None
    return (tmp_10, tmp_12)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_3, in_1, in_0):
 return (in_2, in_3, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
