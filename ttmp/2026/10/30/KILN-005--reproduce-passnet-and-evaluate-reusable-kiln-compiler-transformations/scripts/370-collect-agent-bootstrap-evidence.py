#!/usr/bin/env python3
"""Collect bounded setup receipts/logs; keep bulk weights/build products remote."""
import subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];local=p/'sources/agent-runtime-bootstrap-v1';base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
names=['server-build-v1.json','server-configure-v1.log','server-build-v1.log','model-download-v1.json','agent-image-v1.json','agent-image-v2.json','agent-image-v3.json','agent-image-build-v1.log','agent-image-build-v2.log','agent-image-build-v3.log','agent-image-fidelity-v1.json','converter-environment-v1.json','converter-environment-v2.json','converter-install-v1.log','converter-install-v2.log','converter-pip-freeze-v2.txt','converter-help-v2.log','agent-locked-environment-v1.json','agent-locked-import-v1.log','agent-locked-import-v2.json','agent-locked-pip-freeze-v1.txt','agent-unbounded-environment-superseded.json','model-conversion-v1.json']
for name in names:
 r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','cat '+base+'/'+name],capture_output=True)
 if r.returncode:print('Not available:',name);continue
 destination=local/name
 if destination.exists() and destination.read_bytes()!=r.stdout:raise ValueError('Preserve prior evidence: '+name)
 destination.write_bytes(r.stdout)
 print(name,len(r.stdout))
