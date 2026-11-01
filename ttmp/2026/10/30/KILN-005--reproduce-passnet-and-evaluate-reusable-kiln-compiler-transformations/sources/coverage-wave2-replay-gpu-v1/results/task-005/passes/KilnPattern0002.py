from operator import iadd as kiln_iadd
import torch

def pattern(in_3, in_1, in_0, in_5, in_4, in_2):
    tmp_0 = in_0
    tmp_1 = in_1
    tmp_2 = torch.nn.functional.linear(in_3, tmp_1, tmp_0)
    tmp_3 = tmp_2.view(4, -1, 4, 64)
    tmp_4 = tmp_3.transpose(1, 2)
    tmp_5 = torch.nn.functional.scaled_dot_product_attention(in_5, in_4, tmp_4, attn_mask=in_2, dropout_p=0.0, is_causal=False)
    tmp_6 = tmp_5.transpose(1, 2)
    tmp_7 = tmp_6.reshape(4, 512, 256)
    return tmp_7
from _kiln_generated_runtime import kiln_generated
def replacement_args(in_3, in_1, in_0, in_5, in_4, in_2):
 return (in_3, in_1, in_0, in_5, in_4, in_2, 2)
def replacement_func():
 return kiln_generated
