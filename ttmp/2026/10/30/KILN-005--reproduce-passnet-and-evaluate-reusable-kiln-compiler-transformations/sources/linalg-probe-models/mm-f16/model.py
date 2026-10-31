import torch
class GraphModule(torch.nn.Module):
 def forward(self,a,b):
  return torch.mm(a,b)
