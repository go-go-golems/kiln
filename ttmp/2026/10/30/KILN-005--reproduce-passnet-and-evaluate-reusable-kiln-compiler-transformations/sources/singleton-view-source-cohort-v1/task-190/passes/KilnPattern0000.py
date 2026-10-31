from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1):
    matmul = torch.matmul(in_0, in_1)
    in_0 = in_1 = None
    tmp_1 = matmul.squeeze(1)
    matmul = None
    return tmp_1
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1):
 return (in_0, in_1, 0)
def replacement_func():
 return kiln_generated
