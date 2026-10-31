from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0, in_2):
    matmul = torch.matmul(in_1, in_0)
    in_1 = in_0 = None
    tmp_1 = torch.reshape(matmul, [-1, 16])
    matmul = None
    tmp_2 = in_2.transpose(-1, -2)
    in_2 = None
    return (tmp_1, tmp_2)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0, in_2):
 return (in_1, in_0, in_2, 0)
def replacement_func():
 return kiln_generated
