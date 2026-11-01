from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_5, in_2, in_3, in_1, in_0):
    conv1d = torch.conv1d(in_4, in_5, in_2, (1,), (64,), (1,), 16)
    tmp_4 = conv1d[slice(None, None, None), slice(None, None, None), slice(None, -1, None)]
    tmp_5 = torch.nn.functional.gelu(tmp_4)
    tmp_6 = tmp_5.transpose(1, 2)
    tmp_7 = in_3 + tmp_6
    tmp_8 = torch.nn.functional.dropout(tmp_7, 0.05, False, False)
    tmp_10 = torch.nn.functional.layer_norm(tmp_8, (1024,), in_1, in_0, 1e-05)
    return (tmp_8, tmp_10)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_5, in_2, in_3, in_1, in_0):
 return (in_4, in_5, in_2, in_3, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
