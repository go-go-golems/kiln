#!/usr/bin/env python3
"""Compile only fresh training controls before consumer-program declaration."""
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());corpus=p/'sources/policy-corpus-v6';output=p/'sources/policy-artifacts-v6-controls'
if output.exists():raise ValueError('Preserve earlier controls')
output.mkdir();(corpus/'policies').mkdir()
for name in ['baseline','default']:
 policy={'format':'kiln-fusion-policy/1','id':name,'kind':'unchanged' if name=='baseline' else 'threshold'}
 if name=='default':policy['max_work_growth']=1.02
 path=corpus/'policies'/(name+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
 subprocess.run(['node',str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),'--output',str(output/name),'--policy',str(path),'--target','a100','--phase','train'],check=True)
records=[json.loads((output/name/'compile-receipt.json').read_text())['records'] for name in ['baseline','default']]
if [r['fingerprint'] for r in records[0]]!=[r['fingerprint'] for r in records[1]]:raise ValueError('Explicit default differs from unchanged')
print('QUALIFIED TRAINING CONTROLS',len(records[0]),'no confirmation compilation',flush=True)
