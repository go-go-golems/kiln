from operator import iadd as kiln_iadd
import torch

def pattern(in_0, in_2, in_1, in_3, in_4, in_5, in_6):
    conv2d = torch.conv2d(in_0, in_2, in_1, (2, 2), (0, 0), (1, 1), 1)
    tmp_8 = conv2d.flatten(2)
    tmp_9 = tmp_8.transpose(1, 2)
    tmp_10 = in_3.expand(1, -1, -1)
    tmp_11 = in_4.expand(1, -1, -1)
    tmp_12 = torch.cat((tmp_10, tmp_9, tmp_11), dim=1)
    tmp_13 = in_5[slice(None, None, None), 0, slice(None, None, None)]
    tmp_14 = tmp_13[slice(None, None, None), None]
    tmp_15 = in_5[slice(None, None, None), slice(-10, None, None), slice(None, None, None)]
    tmp_16 = in_5[slice(None, None, None), slice(1, -10, None), slice(None, None, None)]
    tmp_17 = tmp_16.transpose(1, 2)
    tmp_18 = tmp_17.view(1, 32, 15, 15)
    tmp_19 = torch.nn.functional.interpolate(tmp_18, size=(15, 15), mode='bicubic', align_corners=False)
    tmp_20 = tmp_19.flatten(2)
    tmp_21 = tmp_20.transpose(1, 2)
    tmp_22 = torch.cat((tmp_14, tmp_21, tmp_15), dim=1)
    tmp_23 = tmp_12 + tmp_22
    tmp_24 = torch.nn.functional.dropout(tmp_23, 0.1, False, False)
    tmp_25 = in_6[slice(None, None, None), slice(None, None, None), 0, slice(None, None, None)]
    tmp_26 = tmp_25[slice(None, None, None), None]
    tmp_27 = in_6[slice(None, None, None), slice(None, None, None), slice(-10, None, None), slice(None, None, None)]
    tmp_28 = in_6[slice(None, None, None), slice(None, None, None), slice(1, -10, None), slice(None, None, None)]
    tmp_29 = tmp_28.transpose(2, 3)
    tmp_30 = tmp_29.view(4, 32, 15, 15)
    tmp_31 = torch.nn.functional.interpolate(tmp_30, size=(15, 15), mode='bicubic', align_corners=False)
    tmp_32 = tmp_31.flatten(2)
    tmp_33 = tmp_32.transpose(1, 2)
    tmp_34 = tmp_33.contiguous()
    tmp_35 = tmp_34.view(4, 1, 225, 32)
    return (tmp_26, tmp_27, tmp_24, tmp_35)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_0, in_2, in_1, in_3, in_4, in_5, in_6):
 return (in_0, in_2, in_1, in_3, in_4, in_5, in_6, 0)
def replacement_func():
 return kiln_generated
