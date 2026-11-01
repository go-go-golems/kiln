from operator import iadd as kiln_iadd
import torch

def pattern(in_5, in_0, in_1, in_2, in_4, in_3, in_6):
    conv2d = torch.conv2d(in_5, in_0, None, (1, 1), (0, 0), (1, 1), 1)
    tmp_6 = torch.nn.functional.batch_norm(conv2d, in_1, in_2, in_4, in_3, False, 0.1, 1e-05)
    in_6 = kiln_iadd(in_6, tmp_6)
    in_7 = in_6
    return in_7
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_5, in_0, in_1, in_2, in_4, in_3, in_6):
 return (in_5, in_0, in_1, in_2, in_4, in_3, in_6, 1)
def replacement_func():
 return kiln_generated
