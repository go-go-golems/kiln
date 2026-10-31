import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.softmax(x,dim=-1),)
