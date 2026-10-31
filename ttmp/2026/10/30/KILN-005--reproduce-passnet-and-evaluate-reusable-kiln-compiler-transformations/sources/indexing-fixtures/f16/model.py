import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return x[:,1:-1,-2,None],x[...,1,None],x[1,:,:]
