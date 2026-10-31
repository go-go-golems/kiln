from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    matmul = torch.matmul(in_1, in_0)
    in_1 = in_0 = None
    tmp_1 = matmul.view(1, 304, 1, 1)
    matmul = None
    return tmp_1
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 13)
def replacement_func():
 return kiln_generated
