import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  return (torch.nn.functional.relu(torch.softmax(x,-1),inplace=True),)
