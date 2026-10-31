from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1, in_2):
    tmp_0 = torch.matmul(in_0, in_1)
    tmp_1 = tmp_0 / 8.0
    tmp_0 = None
    tmp_2 = torch.nn.functional.softmax(tmp_1, dim=-1)
    tmp_1 = None
    tmp_3 = torch.nn.functional.dropout(tmp_2, 0.0, False, False)
    tmp_2 = None
    tmp_4 = torch.matmul(tmp_3, in_2)
    tmp_3 = None
    tmp_5 = tmp_4.permute(0, 2, 1, 3)
    tmp_4 = None
    tmp_6 = tmp_5.contiguous()
    tmp_5 = None
    tmp_7 = tmp_6.view((1, 256, 512))
    tmp_6 = None
    return tmp_7
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1, in_2):
 return (in_0, in_1, in_2, 7)
def replacement_func():
 return kiln_generated
