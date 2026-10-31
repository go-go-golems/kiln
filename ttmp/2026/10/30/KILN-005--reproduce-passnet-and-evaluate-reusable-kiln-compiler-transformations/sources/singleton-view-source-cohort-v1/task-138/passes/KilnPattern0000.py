from operator import iadd as kiln_iadd
import torch

def pattern(in_0):
    tmp_1 = in_0.unsqueeze(1)
    in_0 = None
    tmp_2 = tmp_1.transpose(2, 3)
    tmp_1 = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
