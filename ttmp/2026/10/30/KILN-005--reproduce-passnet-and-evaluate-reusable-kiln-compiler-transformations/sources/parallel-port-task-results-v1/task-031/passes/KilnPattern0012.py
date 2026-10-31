from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0, in_2):
    tmp_0 = in_1 @ in_0
    tmp_1 = in_1[slice(None, None, None), slice(None, None, None), slice(1, None, None), slice(None, None, None)]
    tmp_2 = in_2[slice(None, None, None), slice(None, None, None), slice(1, None, None), slice(None, None, None)]
    tmp_3 = tmp_2.transpose(-1, -2)
    tmp_2 = None
    tmp_4 = tmp_3.reshape(1, 320, 14, 14)
    tmp_3 = None
    tmp_5 = torch.functional.split(tmp_4, [80, 120, 120], dim=1)
    tmp_4 = None
    tmp_6 = tmp_5[0]
    tmp_7 = tmp_5[1]
    tmp_8 = tmp_5[2]
    tmp_5 = None
    return (tmp_0, tmp_6, tmp_7, tmp_8, tmp_1)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0, in_2):
 return (in_1, in_0, in_2, 12)
def replacement_func():
 return kiln_generated
