from operator import iadd as kiln_iadd, setitem as kiln_setitem
import torch

def pattern(in_2, in_1, in_0):
    tmp_2 = torch.nn.functional.layer_norm(in_2, (432,), in_1, in_0, 1e-06)
    tmp_3 = torch.zeros(1, 196, 196, 3)
    tmp_4 = torch.arange(14)
    tmp_5 = tmp_4.view(1, -1)
    tmp_6 = torch.arange(14)
    tmp_7 = tmp_6.view(-1, 1)
    tmp_8 = tmp_5 - tmp_7
    tmp_9 = tmp_8.repeat(14, 14)
    tmp_10 = tmp_8.repeat_interleave(14, dim=0)
    tmp_11 = tmp_10.repeat_interleave(14, dim=1)
    tmp_12 = tmp_9 ** 2
    tmp_13 = tmp_11 ** 2
    tmp_14 = tmp_12 + tmp_13
    tmp_15 = tmp_14.unsqueeze(0)
    kiln_setitem_0 = kiln_setitem(tmp_3, (slice(None, None, None), slice(None, None, None), slice(None, None, None), 2), tmp_15)
    tmp_17 = tmp_11.unsqueeze(0)
    kiln_setitem_1 = kiln_setitem(tmp_3, (slice(None, None, None), slice(None, None, None), slice(None, None, None), 1), tmp_17)
    tmp_19 = tmp_9.unsqueeze(0)
    kiln_setitem_2 = kiln_setitem(tmp_3, (slice(None, None, None), slice(None, None, None), slice(None, None, None), 0), tmp_19)
    return (tmp_3, tmp_2, kiln_setitem_0, kiln_setitem_1, kiln_setitem_2)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
