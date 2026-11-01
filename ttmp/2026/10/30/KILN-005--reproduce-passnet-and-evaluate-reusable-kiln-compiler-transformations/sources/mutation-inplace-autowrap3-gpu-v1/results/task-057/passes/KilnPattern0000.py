from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_1, in_3, in_0, in_2):
    einsum = torch.functional.einsum('bchj,bhwj->bchw', in_4, in_1)
    in_3 = kiln_iadd(in_3, einsum)
    in_5 = in_3
    tmp_3 = in_5 * in_0
    tmp_4 = tmp_3 + in_2
    tmp_5 = tmp_4.contiguous()
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_1, in_3, in_0, in_2):
 return (in_4, in_1, in_3, in_0, in_2, 0)
def replacement_func():
 return kiln_generated
