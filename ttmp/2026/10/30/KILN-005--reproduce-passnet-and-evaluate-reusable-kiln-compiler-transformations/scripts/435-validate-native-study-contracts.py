#!/usr/bin/env python3
"""Retain focused contract tests and requalify real archived successful artifacts."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
from qualify_policies import qualify

out=ticket/'sources/native-study-contract-validation-v2'
out.mkdir()
initial=snapshot(repo)
commands=[
    [sys.executable,'-m','unittest','discover','-s','integrations/passnet','-p','test_native_policy*.py','-v'],
    [sys.executable,'-m','unittest','discover','-s','integrations/passnet','-p','test_policy_*.py','-v'],
    [sys.executable,'-m','py_compile','integrations/passnet/compile_study.py','integrations/passnet/measure_policy.py'],
]
rows=[]
for index,command in enumerate(commands):
    result=subprocess.run(command,cwd=repo,text=True,capture_output=True)
    log=out/f'{index:02d}.txt';log.write_text(result.stdout+result.stderr)
    rows.append({'command':command,'returncode':result.returncode,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
    if result.returncode:raise RuntimeError('Validation failed: '+str(command))
corpus=ticket/'sources/policy-corpus-v8-r2'
artifacts=ticket/'sources/policy-artifacts-v8-r2'
historical=json.loads((artifacts/'sensitivity.json').read_text())
current=qualify(corpus,artifacts)
assert all(not failures for failures in current['compile_failures'].values())
for key in ['membership_sha256','numerical_policy','default_equals_unchanged','artifact_sha256',
            'semantic_sha256','changes','cross_split_baseline_aliases']:
    assert current[key]==historical[key],key
assert snapshot(repo)==initial
result={'status':'passed','scope':'Contract regression and requalification of historical successful artifacts; no new GPU measurements',
        'source_snapshot':initial,'commands':rows,
        'historical_qualification_sha256':hashlib.sha256((artifacts/'sensitivity.json').read_bytes()).hexdigest(),
        'policies':len(current['artifact_sha256']),'graphs_per_policy':len(current['artifact_sha256']['baseline']),
        'successful_artifact_identities_and_aliases_preserved':True}
(out/'qualification-v2.json').write_text(json.dumps(current,indent=2)+'\n')
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({key:value for key,value in result.items() if key not in ['source_snapshot','commands']},indent=2))
