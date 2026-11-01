from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_0, in_1):
    tmp_2 = torch.nn.functional.softmax(in_2, dim=2)
    tmp_3 = tmp_2.reshape(-1, 17, 64, 64)
    tmp_4 = tmp_3.mul(in_0)
    tmp_5 = tmp_4.reshape(128, 17, -1)
    tmp_6 = torch.sum(tmp_5, dim=2, keepdim=True)
    tmp_7 = tmp_3.mul(in_1)
    tmp_8 = tmp_7.reshape(128, 17, -1)
    tmp_9 = torch.sum(tmp_8, dim=2, keepdim=True)
    tmp_10 = torch.cat([tmp_6, tmp_9], dim=-1)
    return (tmp_3, tmp_10)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_0, in_1):
 return (in_2, in_0, in_1, 0)
def replacement_func():
 return kiln_generated
