import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,w,b):
  return torch.nn.functional.linear(x,w,b)
