#!/usr/bin/env python3
"""Collect only a proven terminal targeted replay, preserving the earlier failures."""
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';base='/home/manuel/passnet-kiln/KILN-005';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
code='import json;from pathlib import Path;p=Path('+repr(base+'/gelu-layernorm-cohort-v1/run.json')+');r=json.loads(p.read_text());assert r["status"]=="complete";print(json.dumps({"status":r["status"],"records":len(r["records"])}))'
observed=json.loads(subprocess.check_output(ssh+['python3 -c '+shlex.quote(code)],text=True));assert observed['records']==1
for name in ['gelu-layernorm-cohort-v1','gelu-layernorm-driver-v1.log']:
 if (s/name).exists():raise ValueError('Preserve collected evidence')
 subprocess.run(['rsync','-a','--no-owner','--no-group','-e','ssh -o HostKeyAlias=bling.local','manuel@bling:'+base+'/'+name,str(s)+'/'],check=True)
print('Collected terminal complete targeted replay')
