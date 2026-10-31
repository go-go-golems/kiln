import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,w):
  return torch.nn.functional.linear(x,w)
