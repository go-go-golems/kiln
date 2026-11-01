from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_4, in_5, in_0, in_3):
    tmp_0 = in_2 * in_1
    tmp_1 = in_2[Ellipsis, slice(None, 128, None)]
    tmp_2 = in_2[Ellipsis, slice(128, None, None)]
    tmp_3 = -tmp_2
    tmp_4 = torch.cat((tmp_3, tmp_1), dim=-1)
    tmp_5 = tmp_4 * in_4
    tmp_6 = tmp_0 + tmp_5
    tmp_7 = tmp_6[slice(None, None, None), slice(None, None, None), None, slice(None, None, None), slice(None, None, None)]
    tmp_8 = tmp_7.expand(1, 1, 8, 3, 256)
    tmp_9 = tmp_8.reshape(1, 8, 3, 256)
    tmp_10 = in_5[slice(None, None, None), slice(None, None, None), None, slice(None, None, None), slice(None, None, None)]
    tmp_11 = tmp_10.expand(1, 1, 8, 3, 256)
    tmp_12 = tmp_11.reshape(1, 8, 3, 256)
    tmp_13 = in_0[slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 3, None)]
    tmp_14 = in_3.contiguous()
    return (tmp_13, tmp_6, tmp_9, tmp_14, tmp_12)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_4, in_5, in_0, in_3):
 return (in_2, in_1, in_4, in_5, in_0, in_3, 0)
def replacement_func():
 return kiln_generated
