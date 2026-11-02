"""Numerical diagnostic only: compare unchanged artifacts with independent references."""
import argparse,json,sys
from pathlib import Path
root=Path('/work');sys.path[:0]=[str(root/'kiln/integrations/passnet'),str(root/'kiln/runtime/python'),str(root/'upstream')]
import torch
from corpus import canonical_order_inputs,load_module
from runtime import TorchProgram
from pass_bench.torch.test_compiler import get_input_dict
from measure_policy import save
p=root/'study';record=json.loads((p/'corpus/manifest.json').read_text())['variants'][1];source=root/'upstream'/record['graph']
torch.set_float32_matmul_precision('highest');torch.backends.cudnn.allow_tf32=False;torch.manual_seed(42)
named=get_input_dict(argparse.Namespace(model_path=str(source),device='cuda'));original=[named[f'in_{i}'] for i in range(len(named))];inputs=canonical_order_inputs(record,original)
w,mean,var,bias,scale,x=original
native=load_module(source/'model.py').GraphModule()(*original)[0]
conv=torch.conv2d(x,w);shape=(1,-1,1,1)
def explicit(c):return ((c-mean.reshape(shape))/torch.sqrt(var.reshape(shape)+1e-5))*scale.reshape(shape)+bias.reshape(shape)
sequential=torch.zeros_like(conv)
for i in range(x.shape[1]):sequential=sequential+x[:,i:i+1]*w[:,i,0,0].reshape(1,-1,1,1)
precise=(w[:,:,0,0].double()@x[0].flatten(1).double()).reshape(conv.shape)
precise=((precise-mean.double().reshape(shape))/torch.sqrt(var.double().reshape(shape)+1e-5))*scale.double().reshape(shape)+bias.double().reshape(shape)
refs={'native':native,'native_conv_explicit_bn':explicit(conv),'sequential_conv_explicit_bn':explicit(sequential),'float64_math_cast_f32':precise.float()}
actual={}
for role in ['baseline','pointwise']:
 program=TorchProgram(p/role/Path(record['script']).with_suffix('.json').name,include_paths=['/usr/local/cuda/include'])
 try:actual[role]=program(*inputs)['out0'].clone()
 finally:program.close()
def compare(a,b):
 delta=(a-b).abs();limit=1e-5+1.3e-6*b.abs()
 return {'max_abs':delta.max().item(),'rms':delta.double().square().mean().sqrt().item(),'mismatches':(delta>limit).sum().item(),'elements':a.numel()}
result={'scope':'Diagnostic references on the failed confirmation graph; no acceptance or tolerance change','graph':record['graph'],'artifact_comparisons':{name:{ref:compare(value,reference) for ref,reference in refs.items()} for name,value in actual.items()},'reference_vs_float64':{name:compare(value,refs['float64_math_cast_f32']) for name,value in refs.items()},'conv_native_vs_sequential':compare(conv,sequential),'variance_min':var.min().item()}
save(root/'diagnostic.json',result);print(json.dumps(result,indent=2))
