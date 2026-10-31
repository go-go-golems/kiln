import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,y):
  return (torch.matmul(x,y).transpose(1,2).reshape([3,17,1,11]).reshape([3,17,11]),)
