from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_2, in_3, in_1):
    tmp_0 = in_0 / 8.0
    in_0 = None
    tmp_1 = tmp_0 + in_2
    tmp_0 = in_2 = None
    tmp_2 = torch.nn.functional.softmax(tmp_1, dim=-1)
    tmp_1 = None
    tmp_3 = torch.nn.functional.dropout(tmp_2, 0.1, False, False)
    tmp_2 = None
    matmul = torch.matmul(tmp_3, in_3)
    tmp_3 = in_3 = None
    tmp_5 = matmul.permute(0, 2, 1, 3)
    matmul = None
    tmp_6 = tmp_5.contiguous()
    tmp_5 = None
    tmp_7 = torch.reshape(in_1, [1, -1, 6, 64])
    in_1 = None
    return (tmp_6, tmp_7)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_2, in_3, in_1):
 return (in_0, in_2, in_3, in_1, 0)
def replacement_func():
 return kiln_generated
