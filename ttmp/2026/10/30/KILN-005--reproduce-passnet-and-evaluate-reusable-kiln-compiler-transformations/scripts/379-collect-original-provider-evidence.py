#!/usr/bin/env python3
"""Snapshot public experiment evidence in one SSH round trip; never overwrite history."""
import argparse,base64,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);a=parser.parse_args();assert a.tag.replace('-','').isalnum()
p=Path(__file__).resolve().parents[1];destination=p/'sources/agent-runtime-bootstrap-v1'/('provider-evidence-'+a.tag);destination.mkdir();base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
names=['model-conversion-v1.json','model-server-v1.json','model-server-v1.log','model-api-probe-v1.json','original-agent-smoke-v1.json','original-agent-smoke-v1.log','original-agent-smoke-driver-v1.log','original-agent-smoke-v2.json','original-agent-smoke-v2.log','original-agent-smoke-driver-v3.log','agent-image-shell-v4.json','agent-image-shell-v5.json','agent-image-shell-driver-v5.log','original-agent-smoke-v4.json','original-agent-smoke-v4.log','original-agent-smoke-v5.json','original-agent-smoke-v5.log','passagent-shipping-smoke-shell-v5.jsonl','passagent-evaluation-200-shell-v5.jsonl']
remote="import base64,json;from pathlib import Path;p=Path("+repr(base)+");names="+repr(names)+";print(json.dumps([{'name':name,'content_base64':base64.b64encode((p/name).read_bytes()).decode()} for name in names if (p/name).is_file()]))"
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True,check=True);manifest=[]
for item in json.loads(r.stdout):
 name=item['name'];assert name in names and Path(name).name==name
 content=base64.b64decode(item['content_base64']);(destination/name).write_bytes(content);manifest.append({'remote_path':base+'/'+name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
(destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(destination/'capture-metadata.json').write_text(json.dumps({'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'files':len(manifest),'snapshot':'Live logs may continue remotely; these captured bytes are frozen'},indent=2)+'\n')
print(json.dumps({'destination':str(destination),'files':len(manifest),'bytes':sum(row['bytes'] for row in manifest)},indent=2))
