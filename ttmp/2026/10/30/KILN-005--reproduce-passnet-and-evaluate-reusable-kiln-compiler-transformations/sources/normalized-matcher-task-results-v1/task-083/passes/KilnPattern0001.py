from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_0):
    conv2d = torch.conv2d(in_1, in_0, None, (1, 1), (0, 0), (1, 1), 1)
    in_1 = in_0 = None
    tmp_2 = torch.nn.functional.pad(conv2d, [2, 2, 2, 2], 'constant', None)
    conv2d = None
    tmp_3 = tmp_2.unfold(2, 12, 8)
    tmp_2 = None
    tmp_4 = tmp_3.unfold(3, 12, 8)
    tmp_3 = None
    tmp_5 = tmp_4.reshape(8, 48, 4, -1)
    tmp_4 = None
    tmp_6 = tmp_5.permute(0, 2, 3, 1)
    tmp_5 = None
    split = torch.functional.split(tmp_6, [16, 32], dim=-1)
    tmp_6 = None
    tmp_8 = split[0]
    tmp_9 = split[1]
    split = None
    tmp_10 = tmp_8.transpose(-1, -2)
    tmp_8 = None
    return (tmp_10, tmp_9)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_0):
 return (in_1, in_0, 1)
def replacement_func():
 return kiln_generated
