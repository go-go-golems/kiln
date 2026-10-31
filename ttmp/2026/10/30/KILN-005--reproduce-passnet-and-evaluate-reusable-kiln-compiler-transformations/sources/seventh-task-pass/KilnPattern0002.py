from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1, in_2):
    tmp_2 = torch.nn.functional.dropout(in_2, p=0.0, training=False)
    in_2 = None
    to = tmp_2.to(torch.bfloat16)
    tmp_2 = None
    linear = torch.nn.functional.linear(to, in_1, in_0)
    to = in_1 = in_0 = None
    return linear
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1, in_2):
 return (in_0, in_1, in_2, 2)
def replacement_func():
 return kiln_generated
