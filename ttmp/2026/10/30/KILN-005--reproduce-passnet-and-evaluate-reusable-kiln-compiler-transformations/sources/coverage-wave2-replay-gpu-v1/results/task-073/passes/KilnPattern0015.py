from operator import iadd as kiln_iadd
import torch

def pattern(in_6, in_5, in_4, in_7, in_0, in_1, in_3, in_2):
    conv2d = torch.conv2d(in_6, in_5, in_4, (1, 1), (0, 0), (1, 1), 48)
    tmp_7 = in_7 + conv2d
    tmp_8 = tmp_7 + in_6
    tmp_9 = torch.nn.functional.batch_norm(tmp_8, in_0, in_1, in_3, in_2, False, 0.1, 1e-05)
    tmp_10 = tmp_9.mean((2, 3), keepdim=True)
    return (tmp_9, tmp_10)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_6, in_5, in_4, in_7, in_0, in_1, in_3, in_2):
 return (in_6, in_5, in_4, in_7, in_0, in_1, in_3, in_2, 15)
def replacement_func():
 return kiln_generated
