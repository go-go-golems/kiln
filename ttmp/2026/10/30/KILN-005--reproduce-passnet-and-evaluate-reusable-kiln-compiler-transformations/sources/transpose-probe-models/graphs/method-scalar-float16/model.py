import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (x.transpose(dim0=-1,dim1=0),)
