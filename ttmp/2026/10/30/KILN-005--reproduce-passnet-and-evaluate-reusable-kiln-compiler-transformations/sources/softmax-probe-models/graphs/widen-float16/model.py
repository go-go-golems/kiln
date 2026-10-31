import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.softmax(x,-1,dtype=torch.float32),)
