from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_0, in_1):
    tmp_2 = torch.nn.functional.layer_norm(in_2, (512,), in_1, in_0, 1e-05)
    in_2 = in_1 = in_0 = None
    tmp_3 = tmp_2.transpose(-2, -1)
    tmp_2 = None
    tmp_4 = torch.nn.functional.gelu(tmp_3)
    tmp_3 = None
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_0, in_1):
 return (in_2, in_0, in_1, 0)
def replacement_func():
 return kiln_generated
