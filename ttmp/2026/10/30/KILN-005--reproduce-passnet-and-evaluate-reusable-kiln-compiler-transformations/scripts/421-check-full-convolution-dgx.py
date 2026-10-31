"""Native CUDA check at the original full shape, preserving all finite errors."""
import json
from pathlib import Path
import shlex
import subprocess

ticket=Path(__file__).resolve().parents[1]
local=ticket/'sources/singleton-full-precision-v2'
remote='/home/manuel/passnet-kiln/KILN-005/sources/singleton-full-precision-v2'
ssh=['ssh','-o','BatchMode=yes','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['mkdir -p '+shlex.quote(remote)],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',*[str(local/name) for name in ['inputs.json','v0.f32','v1.f32','v2.f32']],'manuel@bling:'+remote+'/'],check=True)
code=r'''
import hashlib,json
from pathlib import Path
import torch
import torch.nn.functional as F
p=Path('/probe');raw=(p/'inputs.json').read_bytes();data=json.loads(raw)
torch.set_float32_matmul_precision('highest');torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
inputs=[]
for name in ['v0','v1','v2']:
 spec=data['input_files'][name];binary=(p/spec['file']).read_bytes()
 assert len(binary)==spec['bytes'] and hashlib.sha256(binary).hexdigest()==spec['sha256']
 inputs.append(torch.frombuffer(bytearray(binary),dtype=torch.float32).reshape(spec['shape']).to(device='cuda',dtype=torch.float16))
x,w,b=inputs
def compare(actual,reference):
 expected=torch.tensor(reference,device='cuda',dtype=torch.float64)
 delta=(actual.flatten().double()-expected).abs();assert torch.isfinite(delta).all()
 bad=(delta>1e-4+1e-3*expected.abs()).nonzero().flatten()
 return {'different':int((delta!=0).sum()),'failed':len(bad),'max_abs':delta.max().item(),
 'examples':[{'index':i,'actual':actual.flatten()[i].item(),'reference':expected[i].item()} for i in bad[:12].tolist()]}
rows=[]
with torch.no_grad():
 for mode in ['native-bias','explicit-half-bias-boundary']:
  conv=F.conv2d(x,w,b) if mode=='native-bias' else F.conv2d(x,w,None)+b.reshape(1,1,1,1)
  out=F.softmax(conv.reshape(128,1,48).float(),dim=2).half()
  rows.append({'mode':mode,'against_frontend':compare(out,data['frontend_output']),
   'against_loop':compare(out,data['loop_output']),'output':out.flatten().tolist()})
torch.cuda.synchronize()
print(json.dumps({'format':'kiln-full-native-convolution-precision/2','inputs_manifest_sha256':hashlib.sha256(raw).hexdigest(),
 'torch':torch.__version__,'cudnn':torch.backends.cudnn.version(),'gpu':torch.cuda.get_device_name(),
 'tf32':False,'cudnn_benchmark':torch.backends.cudnn.benchmark,'cudnn_deterministic':torch.backends.cudnn.deterministic,
 'input_shapes':[list(t.shape) for t in inputs],'records':rows,
 'scope':'Full-shape deterministic arithmetic probe. No Kiln GPU artifact and no PassBench acceptance.'},indent=2))
'''
command=['docker','run','--rm','--gpus','all','-v',remote+':/probe:ro','--entrypoint','python',
 'sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba','-c',code]
result=subprocess.run(ssh+[shlex.join(command)],capture_output=True,text=True)
for suffix,value in [('stdout',result.stdout),('stderr',result.stderr)]:
 (local/('native.'+suffix+'.log')).write_text(value)
if result.returncode:raise RuntimeError(f'full CUDA probe exit {result.returncode}: {result.stderr[-2000:]}')
facts=json.loads(result.stdout)
(local/'native.json').write_text(json.dumps(facts,indent=2)+'\n')
print(json.dumps({'input_shapes':facts['input_shapes'],'records':[{k:row[k] for k in ['mode','against_frontend','against_loop']} for row in facts['records']]},indent=2))
