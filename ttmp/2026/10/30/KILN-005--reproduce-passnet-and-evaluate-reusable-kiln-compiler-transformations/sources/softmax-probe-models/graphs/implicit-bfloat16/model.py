import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.nn.functional.softmax(x),)
