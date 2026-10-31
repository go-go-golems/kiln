#!/usr/bin/env python3
# Historical diagnostic: placeholders nested in slice bounds do not match literals.
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
def pattern(x,y,stop):
 z=torch.cat([x,y],dim=1)[:,:stop,:,:]
 return z,z.mean((2,3),keepdim=True)
def target(x,y):
 z=torch.cat([x,y],dim=1)[:,:6,:,:]
 return z,z.mean((2,3),keepdim=True)
a=symbolic_trace(pattern);b=symbolic_trace(target)
print(a.graph);print('matches',len(SubgraphMatcher(a.graph).match(b.graph)))
