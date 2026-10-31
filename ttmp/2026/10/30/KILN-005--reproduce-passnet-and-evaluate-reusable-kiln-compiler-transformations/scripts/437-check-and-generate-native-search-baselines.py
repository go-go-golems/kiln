#!/usr/bin/env python3
"""Validate the shared search path and generate the declared deterministic arms."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--study',type=Path,required=True)
args=parser.parse_args();study=args.study.resolve()
out=study/'validation';out.mkdir()
commands=[['python3','-m','unittest','discover','-s','integrations/passnet','-p',pattern,'-v']
          for pattern in ['test_native_policy*.py','test_policy*.py']]
commands.append(['python3','-m','py_compile',*[str(repo/'integrations/passnet'/name) for name in
                 ['policy_search.py','freeze_study.py','measure_policy.py','summarize_policy.py']]])
receipts=[]
for index,command in enumerate(commands):
    result=subprocess.run(command,cwd=repo,capture_output=True,text=True)
    (out/f'{index:02d}.stdout.txt').write_text(result.stdout)
    (out/f'{index:02d}.stderr.txt').write_text(result.stderr)
    receipts.append({'command':command,'returncode':result.returncode})
    (out/'checks.json').write_text(json.dumps(receipts,indent=2)+'\n')
    if result.returncode:raise SystemExit(result.returncode)
sys.path.insert(0,str(repo/'integrations/passnet'))
from policy_search import run_baseline
read=lambda path:json.loads(path.read_text())
protocol=read(study/'protocol.json');manifest=read(study/'corpus/manifest.json')
receipt=read(study/'controls/default/compile-receipt.json')
baseline_protocol={**protocol,'searches':[s for s in protocol['searches'] if s['method']!='external-llm']}
runs={}
for search in baseline_protocol['searches']:
    path=study/'runs'/search['id'];runs[search['id']]=path
    # Retain the full three-arm protocol identity in each actual generation.
    run_baseline(protocol,search['id'],manifest,receipt,path)
# The complete collector requires all declared arms and will run after inference.
result={'status':'complete','membership_sha256':manifest['membership_sha256'],
        'baseline_tasks':{name:read(path/'task/finished.json') for name,path in runs.items()},
        'source_sha256':{name:hashlib.sha256((repo/'integrations/passnet'/name).read_bytes()).hexdigest()
                         for name in ['policy_search.py','freeze_study.py','measure_policy.py','summarize_policy.py']},
        'scope':'Validation and deterministic proposals only; external model and GPU measurements pending'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
