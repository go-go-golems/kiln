from operator import iadd as kiln_iadd
import torch

def pattern(in_6, in_1, in_0, in_2, in_3, in_5, in_4):
    conv3d = torch.conv3d(in_6, in_1, in_0, (2, 16, 16), (0, 0, 0), (1, 1, 1), 1)
    tmp_7 = conv3d.flatten(2)
    tmp_8 = tmp_7.transpose(1, 2)
    tmp_9 = in_2.tile([1, 1, 1])
    tmp_10 = torch.cat((tmp_9, tmp_8), dim=1)
    tmp_11 = tmp_10 + in_3
    tmp_12 = torch.nn.functional.dropout(tmp_11, 0.0, False, False)
    tmp_13 = torch.nn.functional.layer_norm(tmp_12, (768,), in_5, in_4, 1e-06)
    return (tmp_12, tmp_13)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_6, in_1, in_0, in_2, in_3, in_5, in_4):
 return (in_6, in_1, in_0, in_2, in_3, in_5, in_4, 0)
def replacement_func():
 return kiln_generated
