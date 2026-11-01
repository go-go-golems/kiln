from operator import iadd as kiln_iadd
import torch

def pattern(in_4, in_1, in_0, in_3, in_2):
    conv2d = torch.conv2d(in_4, in_1, in_0, (1, 1), (0, 0), (1, 1), 1)
    tmp_5 = torch.nn.functional.layer_norm(conv2d, (16, 1, 1), in_3, in_2, 1e-05)
    tmp_6 = torch.nn.functional.relu(tmp_5, inplace=True)
    return tmp_6
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_4, in_1, in_0, in_3, in_2):
 return (in_4, in_1, in_0, in_3, in_2, 3)
def replacement_func():
 return kiln_generated
