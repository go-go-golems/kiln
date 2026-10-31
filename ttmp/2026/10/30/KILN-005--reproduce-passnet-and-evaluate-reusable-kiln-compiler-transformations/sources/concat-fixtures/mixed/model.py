import torch
class GraphModule(torch.nn.Module):
 def forward(self,x,y,z):
  return torch.cat((x,y,z),dim=-1),torch.cat((x.transpose(0,1),y.transpose(0,1),z.transpose(0,1)),dim=0),torch.cat((x,y,z),dim=-1)[:,1:-1]
