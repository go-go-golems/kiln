from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_0, in_2):
    conv2d = torch.conv2d(in_3, in_1, in_0, (1, 1), (0, 0), (1, 1), 1)
    in_3 = in_1 = in_0 = None
    tmp_3 = conv2d.sigmoid()
    conv2d = None
    tmp_4 = in_2 * tmp_3
    in_2 = tmp_3 = None
    tmp_5 = torch.nn.functional.gelu(tmp_4, approximate='none')
    tmp_4 = None
    tmp_6 = torch.nn.functional.adaptive_avg_pool2d(tmp_5, 1)
    tmp_5 = None
    tmp_7 = tmp_6.flatten(1, -1)
    tmp_6 = None
    tmp_8 = torch.nn.functional.dropout(tmp_7, 0.0, False, False)
    tmp_7 = None
    return tmp_8
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_0, in_2):
 return (in_3, in_1, in_0, in_2, 0)
def replacement_func():
 return kiln_generated
