import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.nn.functional.softmax(input=x,dim=1),)
