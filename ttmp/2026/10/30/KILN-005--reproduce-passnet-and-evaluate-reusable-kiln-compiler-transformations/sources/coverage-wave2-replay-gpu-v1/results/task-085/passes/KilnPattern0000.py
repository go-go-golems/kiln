from operator import iadd as kiln_iadd
import torch

def pattern(in_0):
    tmp_0 = in_0 / 11.313708498984761
    tmp_1 = torch.nn.functional.relu(tmp_0)
    tmp_2 = torch.square(tmp_1)
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
