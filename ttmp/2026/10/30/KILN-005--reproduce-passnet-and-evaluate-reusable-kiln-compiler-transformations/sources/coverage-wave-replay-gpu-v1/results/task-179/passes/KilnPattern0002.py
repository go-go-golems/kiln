from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_5, in_2, in_6, in_4, in_0):
    tmp_0 = in_0
    tmp_1 = in_3 * in_1
    tmp_2 = in_3[Ellipsis, slice(1, None, 2)]
    tmp_3 = -tmp_2
    tmp_4 = in_3[Ellipsis, slice(None, None, 2)]
    tmp_5 = torch.stack([tmp_3, tmp_4], -1)
    tmp_6 = tmp_5.reshape((1, 12, 256, 64))
    tmp_7 = tmp_6 * in_5
    tmp_8 = tmp_1 + tmp_7
    tmp_9 = torch.cat([in_2, tmp_8], dim=2)
    tmp_10 = tmp_9.type_as(in_6)
    tmp_11 = in_4[slice(None, None, None), slice(None, None, None), slice(None, 1, None), slice(None, None, None)]
    tmp_12 = in_4[slice(None, None, None), slice(None, None, None), slice(1, None, None), slice(None, None, None)]
    tmp_13 = tmp_0.tensor_split(2, -1)
    tmp_14 = tmp_13[0]
    tmp_15 = tmp_13[1]
    tmp_16 = tmp_12 * tmp_15
    tmp_17 = tmp_12[Ellipsis, slice(1, None, 2)]
    tmp_18 = -tmp_17
    tmp_19 = tmp_12[Ellipsis, slice(None, None, 2)]
    tmp_20 = torch.stack([tmp_18, tmp_19], -1)
    tmp_21 = tmp_20.reshape((1, 12, 256, 64))
    tmp_22 = tmp_21 * tmp_14
    tmp_23 = tmp_16 + tmp_22
    tmp_24 = torch.cat([tmp_11, tmp_23], dim=2)
    tmp_25 = tmp_24.type_as(in_6)
    return (tmp_25, tmp_10)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_5, in_2, in_6, in_4, in_0):
 return (in_3, in_1, in_5, in_2, in_6, in_4, in_0, 2)
def replacement_func():
 return kiln_generated
