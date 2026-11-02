#!/usr/bin/env python3
"""Compare declared CUDA fixtures against independent PyTorch source equations."""
import hashlib,json,sys
from pathlib import Path
sys.path[:0]=['/work/kiln/runtime/python','/work/kiln/integrations/passnet']
import torch
from runtime import TorchProgram,DTYPES
root=Path('/work');directory=root/'selective-fusion-fixtures';manifest=json.loads((directory/'manifest.json').read_text());records=[]
output=root/'selective-fusion-cuda.json'
for fixture in manifest['records']:
 artifact=directory/fixture['artifact']
 if hashlib.sha256(artifact.read_bytes()).hexdigest()!=fixture['artifact_sha256']:raise ValueError('Fixture artifact changed')
 program=TorchProgram(artifact,include_paths=['/usr/local/cuda/include'])
 try:
  for seed in [1,7,42]:
   torch.manual_seed(seed);dtype=DTYPES[fixture['dtype']]
   inputs=[torch.randn(shape,device='cuda').to(dtype) for shape in fixture['inputs'].values()];snapshots=[x.clone() for x in inputs];x,y,z=inputs
   p=(torch.exp(x.float()) if fixture['kind']=='elementwise' else (x.float()*x.float()).sum(-1,keepdim=True)).to(dtype)
   a=((p.float()+p.float()).sum(0,keepdim=True) if fixture['kind']=='nested' else p.float()+y.float()).to(dtype)
   expected={'a':a,'b':(p.float()*z.float()).to(dtype)}
   observed=program(*inputs);torch.cuda.synchronize();row={k:fixture[k] for k in ['kind','dtype','policy','artifact']};row['seed']=seed
   try:
    if set(observed)!=set(expected):raise ValueError('Output structure changed')
    errors={}
    for key,want in expected.items():
     torch.testing.assert_close(observed[key],want,rtol={'f32':1.3e-6,'f16':1e-3,'bf16':.016}[fixture['dtype']],atol=1e-5,equal_nan=True)
     errors[key]=(observed[key].float()-want.float()).abs().max().item()
    for before,after in zip(snapshots,inputs):torch.testing.assert_close(before,after,rtol=0,atol=0)
    row.update(status='passed',max_abs_errors=errors)
   except Exception as error:row.update(status='failed',error=str(error))
   records.append(row);output.write_text(json.dumps({'status':'running','records':records},indent=2)+'\n')
 finally:program.close()
 print(fixture['artifact'],[r['status'] for r in records[-3:]],flush=True)
receipt={'status':'complete','scope':manifest['scope'],'gpu':torch.cuda.get_device_name(),'torch_version':torch.__version__,'comparisons':len(records),'passed':sum(r['status']=='passed' for r in records),'records':records}
output.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='records'}))
if receipt['passed']!=receipt['comparisons']:raise SystemExit(1)
