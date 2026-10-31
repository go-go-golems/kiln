import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.ops.aten.transpose.int(x,-1,0),)
