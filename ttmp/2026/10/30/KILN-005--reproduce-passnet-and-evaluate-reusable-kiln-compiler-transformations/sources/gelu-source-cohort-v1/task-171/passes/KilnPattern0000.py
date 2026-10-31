from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_1):
    tmp_0 = torch.nn.functional.gelu(in_0, approximate='none')
    tmp_1 = tmp_0 * in_1
    tmp_0 = None
    tmp_2 = torch.nn.functional.dropout(tmp_1, 0.1, False, False)
    tmp_1 = None
    return tmp_2
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_1):
 return (in_0, in_1, 0)
def replacement_func():
 return kiln_generated
