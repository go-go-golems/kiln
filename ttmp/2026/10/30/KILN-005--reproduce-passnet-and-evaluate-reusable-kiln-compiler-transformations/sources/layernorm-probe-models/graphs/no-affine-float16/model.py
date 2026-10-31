import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.nn.functional.layer_norm(x,(33,),None,None,1e-5),)
