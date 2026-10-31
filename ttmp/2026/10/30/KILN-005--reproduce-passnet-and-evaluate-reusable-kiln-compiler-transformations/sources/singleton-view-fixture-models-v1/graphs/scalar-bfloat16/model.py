import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (x.unsqueeze(0),torch.unsqueeze(input=x,dim=-1),x.squeeze(),x.squeeze(()),torch.squeeze(input=x,dim=0),x.unsqueeze(-1))
