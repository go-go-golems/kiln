#!/usr/bin/env python3
"""Show why one captured-operand permutation cannot bind both legacy programs."""
import torch
x,y,z=[torch.tensor(v,dtype=torch.float16) for v in [.5,2048,-2048]]
expected=(y+z)+x
for label,values in [('x-y-z',(x,y,z)),('y-z-x',(y,z,x))]:
 a,b,c=values
 print(label,{'source_first_pair':float((a+b)+c),'source_last_pair':float(a+(b+c)),'pattern_expected':float(expected)})
