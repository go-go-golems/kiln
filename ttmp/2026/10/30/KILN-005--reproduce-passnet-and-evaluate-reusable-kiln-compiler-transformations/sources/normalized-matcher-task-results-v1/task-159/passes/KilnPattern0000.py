from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_0, in_2):
    conv2d = torch.conv2d(in_3, in_1, in_0, (1, 1), (0, 0), (1, 1), 1)
    in_3 = in_1 = in_0 = None
    tmp_3 = conv2d.sigmoid()
    conv2d = None
    tmp_4 = in_2 * tmp_3
    in_2 = tmp_3 = None
    tmp_5 = torch.nn.functional.hardtanh(tmp_4, 0.0, 6.0, False)
    tmp_4 = None
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_0, in_2):
 return (in_3, in_1, in_0, in_2, 0)
def replacement_func():
 return kiln_generated
