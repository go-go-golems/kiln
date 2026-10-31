import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,y):
  return (torch.matmul(x,y).transpose(1,2).reshape([2,5,1,3]).reshape([2,5,3]),)
