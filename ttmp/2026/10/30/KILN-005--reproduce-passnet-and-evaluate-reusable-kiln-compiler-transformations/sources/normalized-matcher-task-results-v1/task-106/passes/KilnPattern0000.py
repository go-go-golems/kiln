from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0, in_3):
    conv2d = torch.conv2d(in_2, in_1, in_0, (1, 1), (0, 0), (1, 1), 1)
    in_2 = in_1 = in_0 = None
    tmp_3 = torch.nn.functional.hardtanh(in_3, 0.0, 6.0, False)
    in_3 = None
    tmp_4 = tmp_3 * conv2d
    tmp_3 = conv2d = None
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0, in_3):
 return (in_2, in_1, in_0, in_3, 0)
def replacement_func():
 return kiln_generated
