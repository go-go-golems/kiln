#!/usr/bin/env python3
"""Snapshot immutable evidence without overwriting earlier running observations."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);a=parser.parse_args();assert a.tag.replace('-','').isalnum()
p=Path(__file__).resolve().parents[1];destination=p/'sources/agent-runtime-bootstrap-v1'/('provider-evidence-'+a.tag);destination.mkdir();base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';manifest=[]
for name in ['model-conversion-v1.json','model-server-v1.json','model-server-v1.log','model-api-probe-v1.json','original-agent-smoke-v1.json','original-agent-smoke-v1.log','original-agent-smoke-driver-v1.log','original-agent-smoke-v2.json','original-agent-smoke-v2.log','original-agent-smoke-driver-v3.log','agent-image-shell-v4.json','agent-image-shell-v5.json','agent-image-shell-driver-v5.log','original-agent-smoke-v4.json','original-agent-smoke-v4.log','original-agent-smoke-v5.json','original-agent-smoke-v5.log','passagent-shipping-smoke-shell-v5.jsonl','passagent-evaluation-200-shell-v5.jsonl']:
 r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','cat '+base+'/'+name],capture_output=True)
 if r.returncode:continue
 (destination/name).write_bytes(r.stdout);manifest.append({'remote_path':base+'/'+name,'bytes':len(r.stdout),'sha256':hashlib.sha256(r.stdout).hexdigest()})
(destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))
