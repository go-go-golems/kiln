import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (x.reshape([1,2,3,1]),)
