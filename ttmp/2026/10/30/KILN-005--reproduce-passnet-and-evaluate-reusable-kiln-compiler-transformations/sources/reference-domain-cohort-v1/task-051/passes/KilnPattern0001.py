from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_0, in_1, in_3, in_2):
    tmp_4 = in_4.reshape(1, 256, 16, 16)
    in_4 = None
    tmp_5 = torch.nn.functional.batch_norm(tmp_4, in_0, in_1, in_3, in_2, False, 0.1, 1e-05)
    tmp_4 = in_0 = in_1 = in_3 = in_2 = None
    tmp_6 = torch.nn.functional.silu(tmp_5, inplace=True)
    tmp_5 = None
    return tmp_6
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_0, in_1, in_3, in_2):
 return (in_4, in_0, in_1, in_3, in_2, 1)
def replacement_func():
 return kiln_generated
