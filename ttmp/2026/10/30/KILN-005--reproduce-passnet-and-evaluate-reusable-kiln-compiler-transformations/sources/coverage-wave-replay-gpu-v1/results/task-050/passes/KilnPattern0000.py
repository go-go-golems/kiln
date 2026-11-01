from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_0, in_2, in_1):
    in_3 = kiln_iadd(in_3, in_0)
    in_4 = in_3
    in_4 = kiln_iadd(in_4, in_2)
    tmp_0 = in_4
    tmp_2 = torch.nn.functional.relu(tmp_0, inplace=True)
    tmp_3 = in_1.view(1, 32, -1)
    tmp_4 = tmp_3.permute(0, 2, 1)
    return (tmp_2, tmp_4)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_0, in_2, in_1):
 return (in_3, in_0, in_2, in_1, 0)
def replacement_func():
 return kiln_generated
