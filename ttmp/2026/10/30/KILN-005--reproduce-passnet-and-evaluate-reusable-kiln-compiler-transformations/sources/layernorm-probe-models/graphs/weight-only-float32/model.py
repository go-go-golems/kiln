import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,w):
  return (torch.nn.functional.layer_norm(x,(17,),w,None,1e-5),)
