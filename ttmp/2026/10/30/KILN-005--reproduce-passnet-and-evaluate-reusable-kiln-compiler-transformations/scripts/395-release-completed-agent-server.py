#!/usr/bin/env python3
"""Stop only the owned server after the original agent is proven terminal."""
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1]
remote=r'''
import datetime,json,subprocess
from pathlib import Path
root=Path('/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1');receipt=root/'model-server-release-v1.json';assert not receipt.exists()
assert json.loads((root/'original-agent-smoke-v5.json').read_text())['status']=='complete'
assert subprocess.run(['tmux','has-session','-t','passnet-original-agent-smoke-v5'],capture_output=True).returncode!=0
name='kiln005-qwen-original-server-v1';container=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
assert container['Image']=='sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba'
assert '/storage/model-converted/Qwen3-30B-A3B-BF16.gguf' in container['Config']['Cmd']
command=['docker','stop','--time','30',name];r=subprocess.run(command,capture_output=True,text=True);assert r.returncode==0,r.stderr
value={'format':'kiln-model-server-release/1','status':'stopped','container_id':container['Id'],'command':command,'stdout':r.stdout,'returncode':r.returncode,'time_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reason':'Original50-step trajectory terminal and archived; release resident model before GPU compiler qualification'}
receipt.write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(value,indent=2))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True,check=True);value=json.loads(r.stdout)
with (p/'sources/original-agent-smoke-terminal-v1/model-server-release-v1.json').open('x') as f:f.write(json.dumps(value,indent=2)+'\n')
print(json.dumps(value,indent=2))
