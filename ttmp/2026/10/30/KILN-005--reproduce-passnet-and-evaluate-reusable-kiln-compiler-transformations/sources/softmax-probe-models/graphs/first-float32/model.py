import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (x.softmax(0),)
