from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1):
    tmp_0 = 0.0625 * in_0
    in_0 = None
    tmp_1 = torch.nn.functional.softmax(tmp_0, dim=-1)
    tmp_0 = None
    matmul = torch.matmul(tmp_1, in_1)
    tmp_1 = in_1 = None
    tmp_3 = matmul.permute(0, 2, 1)
    matmul = None
    return tmp_3
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1):
 return (in_0, in_1, 0)
def replacement_func():
 return kiln_generated
