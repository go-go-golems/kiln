"""Diagnostic only: compare exposed stages and alternate accumulation oracles."""
import json,sys
from pathlib import Path
import torch
from runtime import TorchProgram
root=Path(sys.argv[1]);record=json.loads((root/'third-task/manifest.json').read_text())['variants'][0]
torch.manual_seed(42)
inputs=[torch.randn(shape,device='cuda').half() for shape in record['inputs'].values()]
bias,weight,residual,x=inputs
p=TorchProgram(root/'third-task/stages.json',include_paths=['/usr/local/cuda/include'])
actual=p(*inputs)
conv=torch.conv2d(x,weight,bias,(2,2),(1,1),(1,1),1)
relu=torch.relu(conv);added=residual+relu
expected={'conv':conv,'relu':relu,'residual':added,'out0':torch.nn.functional.interpolate(added,size=(24,24),mode='bilinear',align_corners=False)}
def stats(a,b):
 diff=(a.float()-b.float()).abs();bad=diff>1e-5+1e-3*b.float().abs()
 return {'bad':bad.sum().item(),'max_abs':diff.max().item(),'elements':a.numel()}
report={key:stats(actual[key],value) for key,value in expected.items()}
report['relu_from_kiln_conv']=stats(actual['relu'],torch.relu(actual['conv']))
report['add_from_kiln_relu']=stats(actual['residual'],residual+actual['relu'])
report['resize_from_kiln_residual']=stats(actual['out0'],actual['residual'])
# Separate diagnostic oracle; do not change benchmark configuration.
torch.backends.cudnn.allow_tf32=False
fp32=torch.conv2d(x.float(),weight.float(),bias.float(),(2,2),(1,1),(1,1),1).half()
report['kiln_conv_vs_fp32_narrow']=stats(actual['conv'],fp32)
report['torch_half_conv_vs_fp32_narrow']=stats(conv,fp32)
no_bias=torch.conv2d(x,weight,None,(2,2),(1,1),(1,1),1)
report['torch_half_bias_after_narrow']=stats(conv,no_bias+bias.reshape(1,-1,1,1))
torch.cuda.synchronize();p.close()
(root/'third-task/stage-diagnostic.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
