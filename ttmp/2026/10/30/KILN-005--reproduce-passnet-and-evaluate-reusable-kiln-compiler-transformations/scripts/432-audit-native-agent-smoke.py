#!/usr/bin/env python3
"""Audit raw model usage and replay tool actions with the pinned R2E parser."""
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
from run_native_policy_agent import parse_action, SYSTEM_PROMPT

source=ticket/'sources/native-agent-smoke-terminal-v1'
out=ticket/'sources/native-agent-smoke-audit-v1'
out.mkdir()
collection=json.loads((source/'collection.json').read_text())
for name,want in collection['files_sha256'].items():
    assert hashlib.sha256((source/name).read_bytes()).hexdigest()==want,name
with tarfile.open(ticket/'sources/agent-runtime-bootstrap-v1/r2e-gym-source.tar.gz') as archive:
    member=next(m for m in archive.getmembers() if m.name.endswith('/src/r2egym/agenthub/action/action.py'))
    code=archive.extractfile(member).read()
bundle=json.loads((source/'bundle.json').read_text())
assert hashlib.sha256(code).hexdigest()==bundle['framework_files_sha256']['r2egym.agenthub.action.action']
# Execute only this already pinned, stdlib-only framework module; no model text.
module=types.ModuleType('pinned_r2e_action');exec(compile(code,member.name,'exec'),module.__dict__)
config=json.loads((source/'output/agent/config.json').read_text())
summary=json.loads((source/'output/agent/result.json').read_text())
manifest=json.loads((ticket/'sources/policy-corpus-v8-r2/manifest.json').read_text())
receipt=json.loads((ticket/'sources/native-policy-task-check-v2/reference/compile-receipt.json').read_text())
task=NativePolicyTask(out/'replayed-task',manifest,receipt,proposal_budget=config['proposal_budget'])
usage={'prompt_tokens':0,'completion_tokens':0,'total_tokens':0}
actions=[]
messages=[{'role':'system','content':SYSTEM_PROMPT},
          {'role':'user','content':f'Propose up to {config["proposal_budget"]} policies. You have {config["max_steps"]} model steps. Inspect training features first.'}]
responses=sorted((source/'output/agent').glob('*.response.json'))
for index,path in enumerate(responses):
    assert path.name==f'step-{index:04d}.response.json'
    raw=json.loads(path.read_text())
    request=json.loads(path.with_name(path.name.replace('.response.json','.request.json')).read_text())
    assert request['messages']==messages,'Unexpected model-visible context'
    assert request['temperature']==0 and request['stream'] is False and request['model']==config['model']
    assert request['max_tokens']==min(config['per_turn_tokens'],config['completion_budget']-usage['completion_tokens'])
    assert raw['usage']['completion_tokens']<=request['max_tokens']
    assert raw['usage']['total_tokens']==raw['usage']['prompt_tokens']+raw['usage']['completion_tokens']
    for key in usage:usage[key]+=raw['usage'][key]
    step=json.loads(path.with_name(path.name.replace('.response.json','.trajectory-step.json')).read_text())
    for key in usage:
        assert step['token_usage_'+key.removesuffix('_tokens')]==raw['usage'][key]
    choice=raw['choices'][0]
    if choice['finish_reason']=='stop':
        name,parameters,error=parse_action(choice['message'].get('content') or '',module.Action)
        observation=task.call(name,parameters) if name else {'status':'invalid_action','error':error}
    else:
        name='';observation={'status':'incomplete_completion','finish_reason':choice['finish_reason']}
    assert observation==json.loads(step['observation']),f'Observation replay mismatch at step{index}'
    messages.extend([{'role':'assistant','content':choice['message'].get('content') or ''},
                     {'role':'user','content':json.dumps(observation,allow_nan=False)}])
    actions.append({'step':index,'tool':name,'status':observation.get('status'),
                    'artifact_sha256':observation.get('artifact_sha256')})
assert usage==summary['usage']
assert len(responses)==summary['steps'] and len(responses)<=config['max_steps']
assert task.finish()==summary['task']
run=json.loads((source/'run.json').read_text())
assert run['container_absent'] and not run['gpu_processes_after']
result={'format':'kiln-native-agent-smoke-audit/1','status':'passed','model':summary['model'],
        'framework_revision':bundle['framework_revision'],'source_revision':bundle['source_revision'],
        'exit_reason':summary['exit_reason'],'usage':usage,'actions':actions,
        'task':summary['task'],'container_absent':True,'gpu_processes_after':'',
        'scope':'Raw-response/tool/budget replay; no compiler correctness or speedup claim'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
