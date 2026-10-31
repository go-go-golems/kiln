"""Validate activation arithmetic and low-precision operation boundaries on CUDA."""
import argparse
import hashlib
import json
from pathlib import Path
import torch
from runtime import TorchProgram
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
p.add_argument('--include-path',action='append',default=[])
p.add_argument('--owned',action='store_true',help='Also check functionalized in-place SiLU on a fresh ReLU result')
a=p.parse_args()
if a.output.exists():raise ValueError('Preserve prior validation evidence')
result={'format':'kiln-activation-validation/1','device':torch.cuda.get_device_name(),'torch_version':torch.__version__,'status':'running','records':[]}
for name,dtype in [('f32',torch.float32),('f16',torch.float16),('bf16',torch.bfloat16)]:
 artifact=a.directory/(name+'.json');program=TorchProgram(artifact,include_paths=a.include_path)
 try:
  for seed in [1,7,42]:
   row={'dtype':name,'seed':seed,'artifact_sha256':hashlib.sha256(artifact.read_bytes()).hexdigest()}
   try:
    torch.manual_seed(seed)
    x=(torch.randn(16,256,device='cuda')*4).to(dtype);y=torch.randn_like(x)
    edges=torch.tensor([-100,-20,-8,-1,-.01,0,.01,1,8,20,100],device='cuda',dtype=dtype)
    x.view(-1)[:len(edges)]=edges;snapshots=[x.clone(),y.clone()]
    with torch.no_grad():
     sigmoid=torch.sigmoid(x);expected=(torch.nn.functional.silu(x),sigmoid,sigmoid*y)
    if a.owned:expected=expected+(torch.nn.functional.silu(torch.relu(x),inplace=True),)
    actual=program(x,y);errors=[]
    assert len(actual)==len(expected)
    for index,want in enumerate(expected):
     got=actual[f'out{index}'];assert got.shape==want.shape and got.dtype==want.dtype
     torch.testing.assert_close(got,want,rtol={torch.float32:1.3e-6,torch.float16:1e-3,torch.bfloat16:1.6e-2}[dtype],atol=1e-5)
     errors.append(float((got.float()-want.float()).abs().max()))
    for snapshot,value in zip(snapshots,[x,y]):torch.testing.assert_close(value,snapshot,rtol=0,atol=0)
    torch.cuda.synchronize();row.update(status='passed',output_max_abs_errors=errors)
   except Exception as error:row.update(status='failed',error=str(error))
   result['records'].append(row);a.output.write_text(json.dumps(result,indent=2)+'\n');print(name,seed,row['status'],flush=True)
 finally:program.close()
result.update(status='complete',all_passed=all(r['status']=='passed' for r in result['records']))
a.output.write_text(json.dumps(result,indent=2)+'\n')
if not result['all_passed']:raise SystemExit(1)
