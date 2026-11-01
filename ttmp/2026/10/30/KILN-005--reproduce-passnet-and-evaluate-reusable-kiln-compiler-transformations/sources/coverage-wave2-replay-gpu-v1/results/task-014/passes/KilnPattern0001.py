from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_3, in_2, in_1, in_0):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = in_2
    tmp_3 = in_3
    tmp_4 = torch.conv2d(in_4, tmp_3, tmp_2, (1, 1), (1, 1), (1, 1), 1024)
    tmp_5 = tmp_4 + in_4
    tmp_6 = tmp_5.flatten(2)
    tmp_7 = tmp_6.transpose(1, 2)
    tmp_8 = torch.nn.functional.layer_norm(tmp_7, (1024,), tmp_1, tmp_0, 1e-05)
    tmp_9 = tmp_8.transpose(0, 1)
    tmp_10 = tmp_8.transpose(0, 1)
    return (tmp_7, tmp_10, tmp_9)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_3, in_2, in_1, in_0):
 return (in_4, in_3, in_2, in_1, in_0, 1)
def replacement_func():
 return kiln_generated
