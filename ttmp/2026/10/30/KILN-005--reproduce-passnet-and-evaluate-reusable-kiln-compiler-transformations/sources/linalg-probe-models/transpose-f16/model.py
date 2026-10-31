import torch
class GraphModule(torch.nn.Module):
 def forward(self,a,b):
  return a@b.transpose(-1,-2)
