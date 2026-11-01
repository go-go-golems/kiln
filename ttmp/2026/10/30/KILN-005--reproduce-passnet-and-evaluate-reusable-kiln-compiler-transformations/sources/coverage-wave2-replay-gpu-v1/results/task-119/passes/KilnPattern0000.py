from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0, in_4, in_3):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.conv2d(in_2, tmp_1, tmp_0, (1, 1), (0, 0), (1, 1), 1)
    tmp_3 = in_4 + in_3
    tmp_4 = torch.nn.functional.dropout2d(tmp_3, 0.1, False, False)
    return (tmp_4, tmp_2)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0, in_4, in_3):
 return (in_2, in_1, in_0, in_4, in_3, 0)
def replacement_func():
 return kiln_generated
