import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,b):
  return (torch.nn.functional.layer_norm(x,(17,),None,b,1e-5),)
