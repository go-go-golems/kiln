#!/usr/bin/env python3
"""CPU structural diagnostic, independent of numerical benchmarking."""
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher

def pattern(x,y,z):
 value=y+z
 value+=x
 return value,value.mean((2,3),keepdim=True)
class One(torch.nn.Module):
 def forward(self,x):
  value=0+x
  value+=0
  return value,value.mean((2,3),keepdim=True)
class Three(torch.nn.Module):
 def forward(self,x,y,z):
  value=y+z
  value+=x
  return value,value.mean((2,3),keepdim=True)
pat=symbolic_trace(pattern)
print('PATTERN',pat.graph,flush=True)
def backend(gm,inputs):
 print('DYNAMO',gm.graph,flush=True)
 print('MATCHES',len(SubgraphMatcher(pat.graph).match(gm.graph)),flush=True)
 return gm.forward
for model,n in [(One(),1),(Three(),3)]:
 torch.compile(model,backend=backend)(*[torch.randn(1,3,4,4) for _ in range(n)])
