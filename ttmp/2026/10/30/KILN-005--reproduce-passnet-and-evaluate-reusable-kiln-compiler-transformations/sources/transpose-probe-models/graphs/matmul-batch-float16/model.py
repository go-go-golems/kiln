import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,y):
  return (torch.matmul(x,torch.transpose(y,-1,-2)),)
