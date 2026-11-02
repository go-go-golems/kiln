"""Independent native arithmetic probe; never changes compiler or evaluator sources."""
import hashlib
import json
from pathlib import Path
import shlex
import subprocess

ticket = Path(__file__).resolve().parents[1]
remote = '/home/manuel/passnet-kiln/KILN-005/sources/singleton-precision-diagnostic-v1'
witness = ticket / 'sources/singleton-precision-witness-v1.json'
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'HostKeyAlias=bling.local', 'manuel@bling']
subprocess.run(ssh + ['mkdir -p ' + shlex.quote(remote)], check=True)
subprocess.run(['scp', '-o', 'HostKeyAlias=bling.local', str(witness), 'manuel@bling:' + remote + '/witness.json'], check=True)
code = r'''
import hashlib,json
from pathlib import Path
import torch
import torch.nn.functional as F
p=Path('/probe/witness.json');raw=p.read_bytes();data=json.loads(raw)
torch.set_float32_matmul_precision('highest')
torch.backends.cuda.matmul.allow_tf32=False
torch.backends.cudnn.allow_tf32=False
def compare(actual,expected):
 expected=torch.tensor(expected,device=actual.device,dtype=torch.float64)
 delta=(actual.double()-expected).abs()
 return {'different':int((delta!=0).sum()),'failed':int((delta>1e-4+1e-3*expected.abs()).sum()),'max_abs':delta.max().item()}
rows=[]
for device in ['cpu','cuda']:
 for dtype in [torch.float16,torch.float32,torch.float64]:
  def tensor(key):return torch.tensor(data[key]['data'],device=device,dtype=dtype).reshape(data[key]['shape'])
  x,w,b=map(tensor,['input','weight','bias'])
  with torch.no_grad():
   conv=F.conv2d(x,w,b)
   # The actual imported program widens softmax and narrows the result.
   y=F.softmax(conv.reshape(1,1,48).float(),dim=2).half().flatten()
  rows.append({'device':device,'dtype':str(dtype),'matches_program_dtype':dtype==torch.float16,'against_frontend':compare(y,data['frontend_output']),
    'against_loop':compare(y,data['loop_output']),
    'convolution_at_witnesses':{str(i):conv.flatten()[i].item() for i in [5,16]},
    'output':y.tolist()})
torch.cuda.synchronize()
print(json.dumps({'format':'kiln-singleton-native-precision-probe/1','witness_sha256':hashlib.sha256(raw).hexdigest(),
 'torch':torch.__version__,'gpu':torch.cuda.get_device_name(),'tf32':False,'records':rows,
 'scope':'Native arithmetic diagnostic on one retained deterministic row (batch size 1 versus original 128). Only float16 matches program dtype; float32/64 are distinct dtype controls, not isolated accumulation changes. No Kiln GPU artifact or PassBench acceptance.'},indent=2))
'''
command = ['docker', 'run', '--rm', '--gpus', 'all', '-v', remote + ':/probe:ro', '--entrypoint', 'python',
           'sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba', '-c', code]
result = subprocess.run(ssh + [shlex.join(command)], capture_output=True, text=True)
for suffix, content in [('stdout', result.stdout), ('stderr', result.stderr)]:
    (ticket / ('sources/singleton-native-precision-v1.' + suffix + '.log')).write_text(content)
if result.returncode:
    raise RuntimeError(f'native probe exit {result.returncode}: {result.stderr[-2000:]}')
facts = json.loads(result.stdout)
assert facts['witness_sha256'] == hashlib.sha256(witness.read_bytes()).hexdigest()
(ticket / 'sources/singleton-native-precision-v1.json').write_text(json.dumps(facts, indent=2) + '\n')
print(json.dumps({**{key: facts[key] for key in ['torch', 'gpu', 'witness_sha256']},
                  'records': [{key: row[key] for key in ['device', 'dtype', 'against_frontend', 'against_loop']} for row in facts['records']]}, indent=2))
