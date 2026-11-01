from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_4, in_2, in_1, in_0):
    conv1d = torch.conv1d(in_3, in_4, in_2, (2,), (15,), (1,), 16)
    tmp_4 = torch.nn.functional.gelu(conv1d)
    tmp_5 = torch.avg_pool1d(in_3, (2,), (2,), (0,), False, True)
    tmp_6 = tmp_5[Ellipsis, slice(None, 124, None)]
    tmp_7 = tmp_4[Ellipsis, slice(None, 124, None)]
    tmp_8 = tmp_6 + tmp_7
    tmp_9 = tmp_8.transpose(1, 2)
    tmp_10 = torch.nn.functional.layer_norm(tmp_9, (768,), in_1, in_0, 1e-05)
    tmp_11 = torch.nn.functional.dropout(tmp_10, 0.1, False, False)
    return tmp_11
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_4, in_2, in_1, in_0):
 return (in_3, in_4, in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
