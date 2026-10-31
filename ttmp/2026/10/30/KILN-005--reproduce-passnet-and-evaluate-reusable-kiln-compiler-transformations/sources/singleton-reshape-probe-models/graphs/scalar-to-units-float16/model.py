import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.reshape(x,[1,1,1]),)
