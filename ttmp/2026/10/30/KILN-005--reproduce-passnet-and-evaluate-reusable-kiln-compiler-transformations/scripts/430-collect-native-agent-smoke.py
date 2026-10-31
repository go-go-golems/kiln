#!/usr/bin/env python3
"""Collect a terminal owned run and verify every copied file against DGX hashes."""
import hashlib
import json
from pathlib import Path
import subprocess

ticket=Path(__file__).resolve().parent.parent
remote='/home/manuel/passnet-kiln/KILN-005/sources/native-policy-agent-smoke-v1'
out=ticket/'sources/native-agent-smoke-terminal-v1'
assert not out.exists(),'Preserve collected evidence'
code=r'''
import hashlib,json,subprocess
from pathlib import Path
root=Path('/home/manuel/passnet-kiln/KILN-005/sources/native-policy-agent-smoke-v1')
run=json.loads((root/'run.json').read_text())
assert run['status'] in ['complete','failed'],'Run is still active'
assert subprocess.run(['tmux','has-session','-t','kiln-native-agent-smoke-v1'],capture_output=True).returncode!=0,'Owner still live'
names=['run.json','bundle.json','driver.stdout.txt','agent.stdout.txt','model-server.stdout.txt']
paths=[root/name for name in names if (root/name).is_file()]
paths+=sorted(p for p in (root/'output').rglob('*') if p.is_file())
print(json.dumps({'files_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
                  'status':run['status'],'container_absent':run.get('container_absent'),
                  'gpu_processes_now':subprocess.check_output(['nvidia-smi','--query-compute-apps=pid,process_name,used_gpu_memory','--format=csv,noheader'],text=True).strip()}))
'''
result=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=code,text=True,capture_output=True,check=True)
manifest=json.loads(result.stdout)
out.mkdir()
for name in manifest['files_sha256']:
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    (out/name).parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+remote+'/'+name,str(out/name)],check=True)
    assert hashlib.sha256((out/name).read_bytes()).hexdigest()==manifest['files_sha256'][name],name
(out/'collection.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'status':manifest['status'],'verified_files':len(manifest['files_sha256']),
                  'container_absent':manifest['container_absent'],'gpu_processes_now':manifest['gpu_processes_now']},indent=2))
