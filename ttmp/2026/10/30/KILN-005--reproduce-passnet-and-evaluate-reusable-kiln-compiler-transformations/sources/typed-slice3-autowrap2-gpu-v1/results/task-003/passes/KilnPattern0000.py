from operator import iadd as kiln_iadd
import torch

def pattern(in_12, in_2, in_0, in_9, in_6, in_13, in_10, in_11, in_5, in_8, in_1, in_7, in_4, in_3):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = in_2
    tmp_3 = in_3
    tmp_4 = in_4
    tmp_5 = in_5
    tmp_6 = in_6
    tmp_7 = in_7
    tmp_8 = in_8
    tmp_9 = in_9
    tmp_10 = in_10
    tmp_11 = in_11
    tmp_12 = in_12.to(dtype=torch.float32)
    tmp_13 = 1.0 - tmp_12
    tmp_14 = tmp_13 * -3.4028234663852886e+38
    tmp_15 = tmp_2[slice(None, None, None), slice(None, 256, None)]
    tmp_16 = torch.nn.functional.embedding(tmp_0, tmp_9, 0, None, 2.0, False, False)
    tmp_17 = torch.nn.functional.embedding(tmp_15, tmp_6, None, None, 2.0, False, False)
    tmp_18 = in_13[slice(None, None, None), slice(None, None, None), 0]
    tmp_19 = torch.nn.functional.embedding(tmp_18, tmp_10, None, None, 2.0, False, False)
    tmp_20 = in_13[slice(None, None, None), slice(None, None, None), 1]
    tmp_21 = torch.nn.functional.embedding(tmp_20, tmp_11, None, None, 2.0, False, False)
    tmp_22 = in_13[slice(None, None, None), slice(None, None, None), 2]
    tmp_23 = torch.nn.functional.embedding(tmp_22, tmp_10, None, None, 2.0, False, False)
    tmp_24 = in_13[slice(None, None, None), slice(None, None, None), 3]
    tmp_25 = torch.nn.functional.embedding(tmp_24, tmp_11, None, None, 2.0, False, False)
    tmp_26 = in_13[slice(None, None, None), slice(None, None, None), 3]
    tmp_27 = in_13[slice(None, None, None), slice(None, None, None), 1]
    tmp_28 = tmp_26 - tmp_27
    tmp_29 = torch.nn.functional.embedding(tmp_28, tmp_5, None, None, 2.0, False, False)
    tmp_30 = in_13[slice(None, None, None), slice(None, None, None), 2]
    tmp_31 = in_13[slice(None, None, None), slice(None, None, None), 0]
    tmp_32 = tmp_30 - tmp_31
    tmp_33 = torch.nn.functional.embedding(tmp_32, tmp_8, None, None, 2.0, False, False)
    tmp_34 = torch.nn.functional.embedding(tmp_1, tmp_7, None, None, 2.0, False, False)
    tmp_35 = tmp_16 + tmp_17
    tmp_36 = tmp_35 + tmp_19
    tmp_37 = tmp_36 + tmp_21
    tmp_38 = tmp_37 + tmp_23
    tmp_39 = tmp_38 + tmp_25
    tmp_40 = tmp_39 + tmp_29
    tmp_41 = tmp_40 + tmp_33
    tmp_42 = tmp_41 + tmp_34
    tmp_43 = torch.nn.functional.layer_norm(tmp_42, (768,), tmp_4, tmp_3, 1e-12)
    tmp_44 = torch.nn.functional.dropout(tmp_43, 0.1, False, False)
    return (tmp_44, tmp_14)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_12, in_2, in_0, in_9, in_6, in_13, in_10, in_11, in_5, in_8, in_1, in_7, in_4, in_3):
 return (in_12, in_2, in_0, in_9, in_6, in_13, in_10, in_11, in_5, in_8, in_1, in_7, in_4, in_3, 0)
def replacement_func():
 return kiln_generated
