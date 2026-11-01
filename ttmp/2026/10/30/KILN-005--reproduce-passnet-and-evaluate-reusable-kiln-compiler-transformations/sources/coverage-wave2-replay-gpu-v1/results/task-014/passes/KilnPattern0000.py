from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_3, in_2, in_1, in_0):
    conv2d = torch.conv2d(in_4, in_3, in_2, (1, 1), (1, 1), (1, 1), 768)
    tmp_5 = conv2d + in_4
    tmp_6 = tmp_5.flatten(2)
    tmp_7 = tmp_6.transpose(1, 2)
    tmp_8 = torch.nn.functional.layer_norm(tmp_7, (768,), in_1, in_0, 1e-05)
    tmp_9 = tmp_8.transpose(0, 1)
    tmp_10 = tmp_8.transpose(0, 1)
    return (tmp_7, tmp_10, tmp_9)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_3, in_2, in_1, in_0):
 return (in_4, in_3, in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
