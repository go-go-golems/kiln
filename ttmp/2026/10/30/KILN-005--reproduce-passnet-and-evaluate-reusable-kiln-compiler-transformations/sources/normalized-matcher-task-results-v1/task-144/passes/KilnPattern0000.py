from operator import iadd as kiln_iadd
import torch

def pattern(in_2, in_1, in_0):
    tmp_2 = torch.nn.functional.relu(in_2, inplace=False)
    in_2 = None
    tmp_3 = in_1 * tmp_2
    in_1 = tmp_2 = None
    tmp_4 = tmp_3 + in_0
    tmp_3 = in_0 = None
    tmp_5 = torch.nn.functional.pad(tmp_4, (0, 1, 0, 1), 'constant', None)
    tmp_4 = None
    return tmp_5
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_2, in_1, in_0):
 return (in_2, in_1, in_0, 0)
def replacement_func():
 return kiln_generated
