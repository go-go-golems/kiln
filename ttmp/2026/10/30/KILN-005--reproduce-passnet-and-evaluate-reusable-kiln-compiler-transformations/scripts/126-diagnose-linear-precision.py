#!/usr/bin/env python3
"""Isolate reduction/bias/native accuracy paths without changing benchmark flags."""
import json,sys
from pathlib import Path
import torch
from runtime import TorchProgram
root=Path('/work');manifest=json.loads((root/'seventh-task/manifest.json').read_text());entry=manifest['variants'][0]
torch.manual_seed(42)
inputs=[torch.randn(shape,device='cuda').to(torch.bfloat16) for shape in entry['inputs'].values()];bias,weight,x=inputs
program=TorchProgram(root/'seventh-task/000.kiln.json',include_paths=['/usr/local/cuda/include'])
try:
 actual=program(*inputs)['out0']
 refs={'native':torch.nn.functional.linear(x,weight,bias),
       'fp32':torch.nn.functional.linear(x.float(),weight.float(),bias.float()).bfloat16(),
       'fp64':torch.nn.functional.linear(x.double(),weight.double(),bias.double()).bfloat16(),
       'native-staged-bias':torch.nn.functional.linear(x,weight,None)+bias,
       'fp32-staged-bias':torch.nn.functional.linear(x.float(),weight.float(),None).bfloat16()+bias}
 old=torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction
 try:
  torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction=False
  refs['native-no-reduced']=torch.nn.functional.linear(x,weight,bias)
 finally:torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction=old
 result={'torch_version':torch.__version__,'matmul_precision':torch.get_float32_matmul_precision(),'bf16_reduced_precision_reduction':old,'comparisons':{}}
 for name,want in refs.items():
  def compare(a,b):
   diff=(a.float()-b.float()).abs()
   return {'max_abs':float(diff.max()),'mean_abs':float(diff.mean()),'not_equal':int((a!=b).sum()),'not_close':int((~torch.isclose(a,b,rtol=.016,atol=1e-5)).sum())}
  result['comparisons'][name]={'versus_compiled':compare(actual,want),'versus_native':compare(refs['native'],want)}
 (root/'linear-precision-diagnostic.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
finally:program.close()
