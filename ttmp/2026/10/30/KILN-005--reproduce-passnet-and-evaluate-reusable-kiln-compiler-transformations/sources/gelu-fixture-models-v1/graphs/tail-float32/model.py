import torch
class GraphModule(torch.nn.Module):
 def forward(self,x):
  exact=torch.nn.functional.gelu(x)
  return (exact,torch.nn.functional.gelu(x,approximate="tanh"),exact+1)
