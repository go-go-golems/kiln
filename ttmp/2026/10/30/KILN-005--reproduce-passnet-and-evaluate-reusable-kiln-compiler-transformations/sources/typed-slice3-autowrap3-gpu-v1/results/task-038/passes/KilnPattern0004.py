from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1):
    max_1 = torch.max(in_0, -1, keepdim=True)
    tmp_1 = max_1[0]
    tmp_2 = tmp_1.expand_as(in_0)
    tmp_3 = tmp_2 - in_0
    tmp_4 = torch.nn.functional.softmax(tmp_3, dim=-1)
    tmp_5 = in_1.view(2, 512, -1)
    return (tmp_4, tmp_5)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1):
 return (in_0, in_1, 4)
def replacement_func():
 return kiln_generated
