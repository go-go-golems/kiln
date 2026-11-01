from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    tmp_0 = in_1 @ in_0
    tmp_1 = tmp_0.view(2, 256, 20, 20)
    return tmp_1
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 25)
def replacement_func():
 return kiln_generated
