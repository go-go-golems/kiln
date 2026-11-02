#!/usr/bin/env python3
"""Apply the new accounting to a fixed historical response prefix, without inference.

This is counterfactual protocol replay, not a new model trajectory. New prompts
and feedback could change actual model responses; no such outcome is inferred.
"""
import hashlib
import json
from pathlib import Path
import sys
import tarfile
import types

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from native_policy_task import NativePolicyTask
from run_native_policy_agent import dispatch_response
from evaluate_tasks import snapshot

source=ticket/'sources/native-agent-smoke-terminal-v1'
out=ticket/'sources/native-agent-accounting-replay-v2'
out.mkdir()
collection=json.loads((source/'collection.json').read_text())
bundle=json.loads((source/'bundle.json').read_text())
with tarfile.open(ticket/'sources/agent-runtime-bootstrap-v1/r2e-gym-source.tar.gz') as archive:
    member=next(m for m in archive.getmembers() if m.name.endswith('/src/r2egym/agenthub/action/action.py'))
    code=archive.extractfile(member).read()
assert hashlib.sha256(code).hexdigest()==bundle['framework_files_sha256']['r2egym.agenthub.action.action']
module=types.ModuleType('pinned_r2e_action');exec(compile(code,member.name,'exec'),module.__dict__)
manifest=json.loads((ticket/'sources/policy-corpus-v8-r2/manifest.json').read_text())
receipt=json.loads((ticket/'sources/native-policy-task-check-v2/reference/compile-receipt.json').read_text())
task=NativePolicyTask(out/'task',manifest,receipt,proposal_budget=2)
rows=[]
for index in [0,1]:
    name=f'output/agent/step-{index:04d}.response.json'
    raw=(source/name).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==collection['files_sha256'][name]
    choice=json.loads(raw)['choices'][0]
    action,_,error,observation,accounting=dispatch_response(choice['message'].get('content') or '',choice['finish_reason'],task,module.Action)
    rows.append({'historical_step':index,'raw_sha256':collection['files_sha256'][name],
                 'action':action,'parse_error':error,'observation_status':observation.get('status'),
                 'rejected_submissions':observation.get('rejected_submissions',[]),**accounting})
summary=task.finish()
assert summary['attempts']==2 and summary['unique_artifacts']==0
assert rows[1]['identified_submissions']==rows[1]['charged_submissions']==2
result={'status':'passed','scope':'Counterfactual dispatch of historical response prefix; no new inference or prediction of model behavior',
        'source_snapshot':snapshot(repo),'historical_driver_revision':bundle['source_revision'],
        'rows':rows,'task':summary}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({key:value for key,value in result.items() if key!='source_snapshot'},indent=2))
