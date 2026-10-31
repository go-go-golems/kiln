import torch
from _kiln_fifth_runtime import kiln_concat_mean
def pattern(x,y):
 value=torch.cat([x,y],dim=1)[:, :672, :, :]
 return value,value.mean((2,3),keepdim=True)
def replacement_args(x,y):
 return (x,y,672)
def replacement_func():
 return kiln_concat_mean
