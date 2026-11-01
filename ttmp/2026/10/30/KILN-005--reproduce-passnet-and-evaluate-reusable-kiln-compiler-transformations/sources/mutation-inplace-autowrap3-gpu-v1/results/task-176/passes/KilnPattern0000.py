from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_5, in_0, in_1, in_3, in_2):
    in_4 = kiln_iadd(in_4, in_5)
    in_6 = in_4
    tmp_5 = torch.nn.functional.gelu(in_6, approximate='none')
    tmp_6 = torch.nn.functional.batch_norm(tmp_5, in_0, in_1, in_3, in_2, False, 0.1, 1e-05)
    tmp_7 = 0 + tmp_6
    return (tmp_5, tmp_7)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_5, in_0, in_1, in_3, in_2):
 return (in_4, in_5, in_0, in_1, in_3, in_2, 0)
def replacement_func():
 return kiln_generated
