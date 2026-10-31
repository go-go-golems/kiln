from operator import iadd as kiln_iadd
import torch

def pattern(in_0):
    tmp_0 = in_0 * 0.1767766952966369
    in_0 = None
    tmp_1 = tmp_0.softmax(dim=-1)
    tmp_0 = None
    tmp_2 = tmp_1.transpose(-2, -1)
    tmp_1 = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
