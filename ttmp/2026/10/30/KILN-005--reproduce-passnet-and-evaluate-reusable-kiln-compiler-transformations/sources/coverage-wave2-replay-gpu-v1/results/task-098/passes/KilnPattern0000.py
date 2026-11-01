from operator import iadd as kiln_iadd
import torch

def pattern(in_1, in_2, in_0):
    tmp_0 = in_1.view(-1, 1)
    tmp_1 = tmp_0 * in_2
    tmp_2 = in_0.view((-1, 1))
    tmp_3 = tmp_2.expand_as(tmp_1)
    tmp_4 = tmp_1.new_zeros((1000, 16))
    return (tmp_3, tmp_4, tmp_1)
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_1, in_2, in_0):
 return (in_1, in_2, in_0, 0)
def replacement_func():
 return kiln_generated
