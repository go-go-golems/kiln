import torch
class GraphModule(torch.nn.Module):
 def forward(self,a,b):
  return a.matmul(b)
