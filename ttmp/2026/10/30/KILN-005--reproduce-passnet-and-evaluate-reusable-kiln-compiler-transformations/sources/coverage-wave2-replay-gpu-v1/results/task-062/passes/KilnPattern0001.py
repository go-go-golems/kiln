from operator import iadd as kiln_iadd, imul as kiln_imul, setitem as kiln_setitem
import torch

def pattern(in_1, in_0):
    tmp_0 = torch.cat([in_1, in_0])
    tmp_1 = torch.arange(14)
    tmp_2 = torch.arange(14)
    meshgrid = torch.functional.meshgrid(tmp_1, tmp_2, indexing='ij')
    tmp_4 = meshgrid[0]
    tmp_5 = meshgrid[1]
    tmp_6 = torch.stack((tmp_4, tmp_5))
    tmp_7 = torch.flatten(tmp_6, 1)
    tmp_8 = tmp_7[slice(None, None, None), slice(None, None, None), None]
    tmp_9 = tmp_7[slice(None, None, None), None, slice(None, None, None)]
    tmp_10 = tmp_8 - tmp_9
    tmp_11 = tmp_10.permute(1, 2, 0)
    tmp_12 = tmp_11.contiguous()
    tmp_13 = tmp_12[slice(None, None, None), slice(None, None, None), 0]
    tmp_13 = kiln_iadd(tmp_13, 13)
    tmp_14 = tmp_13
    kiln_setitem_0 = kiln_setitem(tmp_12, (slice(None, None, None), slice(None, None, None), 0), tmp_14)
    tmp_16 = tmp_12[slice(None, None, None), slice(None, None, None), 1]
    tmp_16 = kiln_iadd(tmp_16, 13)
    tmp_17 = tmp_16
    kiln_setitem_1 = kiln_setitem(tmp_12, (slice(None, None, None), slice(None, None, None), 1), tmp_17)
    tmp_19 = tmp_12[slice(None, None, None), slice(None, None, None), 0]
    tmp_19 = kiln_imul(tmp_19, 27)
    tmp_20 = tmp_19
    kiln_setitem_2 = kiln_setitem(tmp_12, (slice(None, None, None), slice(None, None, None), 0), tmp_20)
    tmp_22 = torch.zeros(size=(197, 197), dtype=torch.int64)
    tmp_23 = tmp_12.sum(-1)
    kiln_setitem_3 = kiln_setitem(tmp_22, (slice(1, None, None), slice(1, None, None)), tmp_23)
    kiln_setitem_4 = kiln_setitem(tmp_22, (0, slice(0, None, None)), 729)
    kiln_setitem_5 = kiln_setitem(tmp_22, (slice(0, None, None), 0), 730)
    kiln_setitem_6 = kiln_setitem(tmp_22, (0, 0), 731)
    tmp_28 = tmp_22.view(-1)
    return (tmp_0, tmp_28, kiln_setitem_0, kiln_setitem_1, kiln_setitem_2, kiln_setitem_3, kiln_setitem_4, kiln_setitem_5, kiln_setitem_6)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 1)
def replacement_func():
 return kiln_generated
