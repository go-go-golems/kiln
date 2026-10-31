import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.transpose(input=x,dim0=-1,dim1=0),)
