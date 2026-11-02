#!/usr/bin/env python3
"""Compile only frozen training controls; keep confirmation IR uncompiled."""
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());s=p/'sources';corpus=s/'policy-corpus-v5-r1'
policies=corpus/'policies';policies.mkdir(exist_ok=False)
controls=[{'format':'kiln-fusion-policy/1','id':'baseline','kind':'unchanged'},
 {'format':'kiln-fusion-policy/1','id':'default','kind':'threshold','max_work_growth':1.02}]
for policy in controls:
 policy['provenance']={'method':'Unchanged/default controls for the fixed-numerical-contract rich corpus'}
 path=policies/(policy['id']+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
 output=s/'policy-artifacts-v5-r1-controls'/policy['id']
 subprocess.run(['node',str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),'--output',str(output),'--policy',str(path),'--target','a100','--phase','train'],check=True)
compiled={name:json.loads((s/'policy-artifacts-v5-r1-controls'/name/'compile-receipt.json').read_text()) for name in ['baseline','default']}
expected=[r['graph'] for r in json.loads((corpus/'manifest.json').read_text())['variants'] if r['split']=='train']
for receipt in compiled.values():
 assert receipt['phase']=='train' and receipt['numerical_policy']=={'contraction':'separate'}
 assert [r['graph'] for r in receipt['records']]==expected and len(expected)==12
 assert all(r['status']=='compiled' for r in receipt['records'])
assert [r['fingerprint'] for r in compiled['baseline']['records']]==[r['fingerprint'] for r in compiled['default']['records']]
print('QUALIFIED: 12 training controls, explicit default equals unchanged; no confirmation compilation')
