import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,w,b):
  return (torch.nn.functional.layer_norm(x,(17,),w,b,1e-5),)
