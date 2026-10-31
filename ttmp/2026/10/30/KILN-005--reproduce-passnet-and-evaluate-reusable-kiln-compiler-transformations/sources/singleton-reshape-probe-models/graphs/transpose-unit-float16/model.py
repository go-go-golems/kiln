import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (x.transpose(0,1).reshape([1,3,2,1]),)
