#!/usr/bin/env python3
"""Compare both lowerings to native, full-FP32 and FP64 source references."""
import json,sys
from pathlib import Path
sys.path[:0]=['/work/kiln/runtime/python','/work/kiln/integrations/passnet']
import torch
from runtime import TorchProgram
root=Path('/work/singleton-reshape-precision-diagnostic');output=root/'cuda-diagnostic-v2.json'
if output.exists():raise ValueError('Preserve earlier diagnostic')
programs={name:TorchProgram(root/(name+'.json'),include_paths=['/usr/local/cuda/include']) for name in ['baseline','optimized']};rows=[]
initial=torch.backends.cuda.matmul.allow_tf32
try:
 for seed in [1,7,42]:
  torch.manual_seed(seed);x=torch.randn([3,1,17,19],device='cuda');y=torch.randn([3,1,19,11],device='cuda')
  if seed==7:x=x*4;y=y*4
  if seed==42:x=x*0.125+1;y=y*0.125+1
  reshape=lambda z:z.transpose(1,2).reshape([3,17,1,11]).reshape([3,17,11])
  native=reshape(torch.matmul(x,y))
  torch.backends.cuda.matmul.allow_tf32=False
  try:highest=reshape(torch.matmul(x,y));double=reshape(torch.matmul(x.double(),y.double())).float()
  finally:torch.backends.cuda.matmul.allow_tf32=initial
  actual={name:program(x,y)['out0'] for name,program in programs.items()}
  unit_roundoff=2**-24;gamma=38*unit_roundoff/(1-38*unit_roundoff)
  bound=reshape(torch.matmul(x.double().abs(),y.double().abs()))*gamma
  torch.cuda.synchronize();delta=lambda a,b:float((a-b).abs().max())
  row={'seed':seed,'native_vs_fp64_max_abs':delta(native,double),'full_fp32_vs_fp64_max_abs':delta(highest,double),'baseline_vs_optimized_max_abs':delta(actual['baseline'],actual['optimized'])}
  for name,value in actual.items():
   row[name]={'native_max_abs':delta(value,native),'full_fp32_max_abs':delta(value,highest),'fp64_max_abs':delta(value,double)}
   row[name]['strict_comparisons']={}
   for reference_name,reference in [('full_fp32',highest),('fp64',double)]:
    try:torch.testing.assert_close(value,reference,rtol=1.3e-6,atol=1e-5);check={'passed':True}
    except AssertionError as error:check={'passed':False,'error':str(error)}
    row[name]['strict_comparisons'][reference_name]=check
   row[name]['fp32_forward_error_bound_satisfied']=bool(((value.double()-double.double()).abs()<=bound).all())
   row[name]['max_forward_error_bound_ratio']=float(((value.double()-double.double()).abs()/bound).max())
  rows.append(row)
finally:
 torch.backends.cuda.matmul.allow_tf32=initial
 for program in programs.values():program.close()
receipt={'status':'complete','scope':'Precision diagnostic only: original native fixture remains 60/63, with no relaxed tolerance or reclassification','initial_allow_tf32':initial,'torch':torch.__version__,'gpu':torch.cuda.get_device_name(),'records':rows}
output.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
