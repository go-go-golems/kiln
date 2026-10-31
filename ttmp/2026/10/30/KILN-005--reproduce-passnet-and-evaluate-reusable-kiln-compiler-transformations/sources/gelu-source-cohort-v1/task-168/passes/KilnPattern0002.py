from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    conv2d = torch.conv2d(in_2, in_1, in_0, (1, 1), (1, 1), (1, 1), 256)
    in_2 = in_1 = in_0 = None
    tmp_3 = torch.nn.functional.gelu(conv2d)
    conv2d = None
    tmp_4 = torch.nn.functional.dropout(tmp_3, 0.0, False, False)
    tmp_3 = None
    return tmp_4
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 2)
def replacement_func():
 return kiln_generated
