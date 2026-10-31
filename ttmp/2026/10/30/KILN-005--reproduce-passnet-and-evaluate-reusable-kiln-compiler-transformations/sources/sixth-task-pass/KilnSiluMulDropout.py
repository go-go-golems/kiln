import torch
from _kiln_sixth_runtime import kiln_silu_mul
def pattern(x,y):
 return torch.nn.functional.dropout(torch.nn.functional.silu(x,inplace=False)*y,0.0,False,False)
def replacement_args(x,y):
 return (x,y)
def replacement_func():
 return kiln_silu_mul
