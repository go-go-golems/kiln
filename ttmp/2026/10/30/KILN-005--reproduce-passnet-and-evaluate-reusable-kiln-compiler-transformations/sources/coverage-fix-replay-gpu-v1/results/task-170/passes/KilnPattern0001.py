from operator import iadd as kiln_iadd, imul as kiln_imul, setitem as kiln_setitem
import torch
from torch import device

def pattern(in_0):
    tmp_1 = torch.arange(0, 10, device=device(type='cuda', index=0))
    tmp_2 = torch.full((10, 10), fill_value=-3.4028234663852886e+38, dtype=torch.float32, device=device(type='cuda', index=0))
    tmp_3 = torch.triu(tmp_2, diagonal=1)
    tmp_4 = torch.arange(10, device=device(type='cuda', index=0))
    tmp_5 = tmp_1.reshape(-1, 1)
    tmp_6 = tmp_4 > tmp_5
    tmp_3 = kiln_imul(tmp_3, tmp_6)
    tmp_7 = tmp_3
    tmp_8 = tmp_7[None, None, slice(None, None, None), slice(None, None, None)]
    tmp_9 = tmp_8.expand(1, 1, -1, -1)
    tmp_10 = tmp_9.clone()
    tmp_11 = tmp_10[slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 10, None)]
    tmp_12 = in_0[slice(None, None, None), None, None, slice(None, None, None)]
    tmp_13 = tmp_12.to(device(type='cuda', index=0))
    tmp_14 = tmp_11 + tmp_13
    tmp_15 = tmp_14.__eq__(0)
    tmp_16 = tmp_10[slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 10, None)]
    tmp_17 = tmp_16.masked_fill(tmp_15, -3.4028234663852886e+38)
    kiln_setitem_0 = kiln_setitem(tmp_10, (slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 10, None)), tmp_17)
    tmp_19 = tmp_10.__eq__(-3.4028234663852886e+38)
    tmp_20 = torch.all(tmp_19, dim=-1, keepdim=True)
    tmp_21 = ~tmp_20
    tmp_22 = tmp_10.mul(tmp_21)
    return (tmp_22, kiln_setitem_0)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0):
 return (in_0, 1)
def replacement_func():
 return kiln_generated
