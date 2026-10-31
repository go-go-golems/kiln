from operator import iadd as kiln_iadd
import torch

def pattern(in_8, in_7, in_6, in_3, in_2, in_9, in_11, in_5, in_4, in_10, in_1, in_0):
    linear = torch.nn.functional.linear(in_8, in_7, in_6)
    in_8 = in_7 = in_6 = None
    tmp_9 = torch.nn.functional.layer_norm(linear, (256,), in_3, in_2, 1e-05)
    linear = in_3 = in_2 = None
    tmp_10 = in_9.sigmoid()
    in_9 = None
    tmp_11 = tmp_9.sigmoid()
    tmp_9 = None
    tmp_12 = torch.nn.functional.layer_norm(in_11, (256,), in_5, in_4, 1e-05)
    in_11 = in_5 = in_4 = None
    tmp_13 = torch.nn.functional.layer_norm(in_10, (256,), in_1, in_0, 1e-05)
    in_10 = in_1 = in_0 = None
    tmp_14 = tmp_12.unsqueeze(-2)
    tmp_12 = None
    tmp_15 = tmp_11 * tmp_14
    tmp_11 = tmp_14 = None
    tmp_16 = tmp_10 * tmp_13
    tmp_10 = tmp_13 = None
    tmp_17 = tmp_15 + tmp_16
    tmp_15 = tmp_16 = None
    return tmp_17
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_8, in_7, in_6, in_3, in_2, in_9, in_11, in_5, in_4, in_10, in_1, in_0):
 return (in_8, in_7, in_6, in_3, in_2, in_9, in_11, in_5, in_4, in_10, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
