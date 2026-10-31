from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_2, in_3, in_0, in_4):
    tmp_1 = in_1 - in_2
    in_1 = in_2 = None
    tmp_2 = tmp_1.pow(2)
    tmp_1 = None
    tmp_3 = tmp_2.sum(dim=3)
    tmp_2 = None
    tmp_4 = in_3 * tmp_3
    in_3 = tmp_3 = None
    tmp_5 = torch.nn.functional.softmax(tmp_4, dim=2)
    tmp_4 = None
    tmp_6 = in_0.view((1, 1, 32, 512))
    in_0 = None
    tmp_7 = in_4.unsqueeze(2)
    in_4 = None
    tmp_8 = tmp_7.expand((1, 4096, 32, 512))
    tmp_7 = None
    tmp_9 = tmp_5.unsqueeze(3)
    tmp_5 = None
    tmp_10 = tmp_8 - tmp_6
    tmp_8 = tmp_6 = None
    return (tmp_10, tmp_9)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_2, in_3, in_0, in_4):
 return (in_1, in_2, in_3, in_0, in_4, 0)
def replacement_func():
 return kiln_generated
