#!/usr/bin/env python3
"""Collect the verified terminal native and original-evaluator run without overwriting evidence."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';base='manuel@bling:/home/manuel/passnet-kiln/KILN-005/'
observation=json.loads((s/'gelu-remote-observation-first-evaluation.json').read_text())['observation']
assert not observation['session_live'] and observation['gelu-source-cohort-v1/run.json']['status']=='complete'
for name in ['gelu-source-cohort-v1','gelu-cuda-validation-v1.json','gelu-validation-v3.log']:
 if (s/name).exists():raise ValueError('Preserve collected evidence: '+name)
 subprocess.run(['rsync','-a','--no-owner','--no-group','-e','ssh -o HostKeyAlias=bling.local',base+name,str(s)+'/'],check=True)
for name in ['gelu-cuda-validation-v1.json','gelu-source-cohort-v1/run.json']:
 assert hashlib.sha256((s/name).read_bytes()).hexdigest()==observation[name]['sha256'],'Terminal bytes differ from observation'
print('Collected complete terminal GELU run and matching hashes')
