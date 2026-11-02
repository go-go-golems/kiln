#!/usr/bin/env python3
"""Freeze the complete original trajectory and refuse a live-run collection."""
import base64,hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];destination=p/'sources/original-agent-smoke-terminal-v1';destination.mkdir();base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
remote=r'''
import base64,json,subprocess
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1');receipt=json.loads((p/'original-agent-smoke-v5.json').read_text());assert receipt['status']=='complete'
assert subprocess.run(['tmux','has-session','-t','passnet-original-agent-smoke-v5'],capture_output=True).returncode!=0
names=['original-agent-smoke-v5.json','original-agent-smoke-v5.log','model-server-v1.json','model-server-v1.log','original-agent-smoke-v5/original-shipping-smoke-v5.jsonl','original-agent-smoke-v5/original-shipping-smoke-v5_completions.jsonl']
print(json.dumps([{'name':name,'content':base64.b64encode((p/name).read_bytes()).decode()} for name in names]))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True,check=True);manifest=[]
for row in json.loads(r.stdout):
 relative=Path(row['name']);assert not relative.is_absolute() and '..' not in relative.parts
 path=destination/relative;path.parent.mkdir(parents=True,exist_ok=True);raw=base64.b64decode(row['content']);path.write_bytes(raw);manifest.append({'path':row['name'],'remote_path':base+'/'+row['name'],'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Frozen terminal trajectory, completions and logs:',len(manifest),'files')
