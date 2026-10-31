import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,w,b):
  return (torch.nn.functional.layer_norm(x,(3, 5),w,b,1e-5),)
