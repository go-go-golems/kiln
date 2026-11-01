from operator import iadd as kiln_iadd
import torch
from torch import device

def pattern(in_3, in_2, in_1, in_0):
    linear = torch.nn.functional.linear(in_3, in_2, in_1)
    tmp_4 = linear.reshape(1, 49, 8, -1)
    split = tmp_4.split([32, 32, 128], dim=3)
    tmp_6 = split[0]
    tmp_7 = split[1]
    tmp_8 = split[2]
    tmp_9 = tmp_6.permute(0, 2, 1, 3)
    tmp_10 = tmp_7.permute(0, 2, 1, 3)
    tmp_11 = tmp_8.permute(0, 2, 1, 3)
    tmp_12 = in_0.to(device(type='cuda', index=0))
    tmp_13 = tmp_10.transpose(-2, -1)
    return (tmp_9, tmp_12, tmp_13, tmp_11)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_2, in_1, in_0):
 return (in_3, in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
