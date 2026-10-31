#!/usr/bin/env python3
"""Retain focused task-boundary validation and final-source compiler replay."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket = Path(__file__).resolve().parent.parent
repo = next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
output = ticket/'sources/native-policy-boundary-validation-v1'
output.mkdir()
commands = [
    ['node','integrations/passnet/test_optimization_artifact.mjs'],
    [sys.executable,'-m','unittest','discover','-s','integrations/passnet','-p','test_native_policy_task.py','-v'],
    ['node','integrations/passnet/test_fusion_policy.mjs'],
    [sys.executable,'-m','unittest','discover','-s','integrations/passnet','-p','test_policy_proposals.py','-v'],
    [sys.executable,str(ticket/'scripts/426-check-native-policy-task.py'),
     '--output',str(ticket/'sources/native-policy-task-check-v2')],
]
records = []
for i, command in enumerate(commands):
    result = subprocess.run(command,cwd=repo,capture_output=True,text=True)
    log = output/f'{i:02d}.txt'
    log.write_text(result.stdout+result.stderr)
    records.append({'command':command,'returncode':result.returncode,
                    'log':log.name,'sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
    (output/'result.json').write_text(json.dumps({'status':'running' if result.returncode==0 else 'failed',
                                                 'records':records},indent=2)+'\n')
    print(command[1],result.returncode,flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
(output/'result.json').write_text(json.dumps({'status':'passed','records':records},indent=2)+'\n')
