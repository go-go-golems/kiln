from operator import iadd as kiln_iadd
import torch

def pattern(in_6, in_4, in_0, in_1, in_3, in_2, in_5):
    conv2d = torch.conv2d(in_6, in_4, None, (1, 1), (0, 0), (1, 1), 1)
    tmp_6 = torch.nn.functional.batch_norm(conv2d, in_0, in_1, in_3, in_2, False, 0.1, 1e-05)
    tmp_6 = kiln_iadd(tmp_6, in_5)
    tmp_7 = tmp_6
    return tmp_7
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_6, in_4, in_0, in_1, in_3, in_2, in_5):
 return (in_6, in_4, in_0, in_1, in_3, in_2, in_5, 0)
def replacement_func():
 return kiln_generated
