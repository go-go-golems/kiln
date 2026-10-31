from operator import iadd as kiln_iadd
import torch

def pattern(in_0):
    tmp_0 = torch.nn.functional.gelu(in_0)
    in_0 = None
    tmp_1 = tmp_0.reshape(1, 124, 2, 768)
    tmp_0 = None
    tmp_2 = tmp_1.reshape(1, 248, 768)
    tmp_1 = None
    tmp_3 = torch.nn.functional.pad(tmp_2, (0, 0, 0, 1), 'constant', None)
    tmp_2 = None
    return tmp_3
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 0)
def replacement_func():
 return kiln_generated
