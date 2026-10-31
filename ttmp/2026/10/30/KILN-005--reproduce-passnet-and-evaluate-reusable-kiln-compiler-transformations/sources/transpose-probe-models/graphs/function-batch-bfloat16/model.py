import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.transpose(x,-1,0),)
