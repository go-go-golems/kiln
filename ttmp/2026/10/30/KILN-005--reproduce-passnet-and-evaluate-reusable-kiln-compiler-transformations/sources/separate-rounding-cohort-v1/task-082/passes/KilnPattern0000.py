from operator import iadd as kiln_iadd
import torch

def pattern(in_6, in_5, in_4, in_7, in_0, in_1, in_3, in_2):
    linear = torch.nn.functional.linear(in_6, in_5, in_4)
    in_6 = in_5 = in_4 = None
    tmp_7 = torch.nn.functional.batch_norm(in_7, in_0, in_1, in_3, in_2, False, 0.1, 1e-05)
    in_7 = in_0 = in_1 = in_3 = in_2 = None
    return (linear, tmp_7)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_6, in_5, in_4, in_7, in_0, in_1, in_3, in_2):
 return (in_6, in_5, in_4, in_7, in_0, in_1, in_3, in_2, 0)
def replacement_func():
 return kiln_generated
