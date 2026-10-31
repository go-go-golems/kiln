import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.ops.aten.softmax.int(x,-1,None),)
