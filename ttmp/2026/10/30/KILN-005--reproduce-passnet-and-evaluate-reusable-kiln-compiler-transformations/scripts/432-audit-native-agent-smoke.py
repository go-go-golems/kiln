#!/usr/bin/env python3
"""Audit raw model usage and replay tool actions with the pinned R2E parser."""
import argparse
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
from run_native_policy_agent import dispatch_response, SYSTEM_PROMPT

parser=argparse.ArgumentParser(description=__doc__)
for name in ['source','study','output']:parser.add_argument('--'+name,type=Path,required=True)
args=parser.parse_args()
source=args.source;out=args.output
out.mkdir()
collection=json.loads((source/'collection.json').read_text())
for name,want in collection['files_sha256'].items():
    assert hashlib.sha256((source/name).read_bytes()).hexdigest()==want,name
with tarfile.open(ticket/'sources/agent-runtime-bootstrap-v1/r2e-gym-source.tar.gz') as archive:
    member=next(m for m in archive.getmembers() if m.name.endswith('/src/r2egym/agenthub/action/action.py'))
    code=archive.extractfile(member).read()
bundle=json.loads((source/'bundle.json').read_text())
for name in ['native_policy_task.py','run_native_policy_agent.py','optimization_artifact.mjs','fusion_policy.mjs','propose_policy.py']:
    assert hashlib.sha256((repo/'integrations/passnet'/name).read_bytes()).hexdigest()==bundle['files_sha256']['repo/integrations/passnet/'+name]
assert hashlib.sha256(code).hexdigest()==bundle['framework_files_sha256']['r2egym.agenthub.action.action']
# Execute only this already pinned, stdlib-only framework module; no model text.
module=types.ModuleType('pinned_r2e_action');exec(compile(code,member.name,'exec'),module.__dict__)
config=json.loads((source/'output/agent/config.json').read_text())
summary=json.loads((source/'output/agent/result.json').read_text())
assert config['format']=='kiln-native-agent-batch/2' and summary['format']=='kiln-native-agent-batch-result/2'
assert config['system_prompt_sha256']==hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest()
manifest_path=args.study/'corpus/manifest.json';receipt_path=args.study/'controls/default/compile-receipt.json'
assert hashlib.sha256(manifest_path.read_bytes()).hexdigest()==bundle['files_sha256']['inputs/manifest.json']
assert hashlib.sha256(receipt_path.read_bytes()).hexdigest()==bundle['files_sha256']['inputs/receipt.json']
manifest=json.loads(manifest_path.read_text());receipt=json.loads(receipt_path.read_text())
task=NativePolicyTask(out/'replayed-task',manifest,receipt,proposal_budget=config['proposal_budget'])
usage={'prompt_tokens':0,'completion_tokens':0,'total_tokens':0}
accounting_totals={'identified_submissions':0,'charged_submissions':0,'unadmitted_submissions':0}
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
    name,parameters,error,observation,accounting=dispatch_response(
        choice['message'].get('content') or '',choice['finish_reason'],task,module.Action)
    for key,value in accounting.items():
        assert step['info'][key]==value
        accounting_totals[key]+=value
    assert step['info']['parse_error']==error
    assert step['action']==module.Action(name,parameters or {}).to_xml_string()
    assert observation==json.loads(step['observation']),f'Observation replay mismatch at step{index}'
    messages.extend([{'role':'assistant','content':choice['message'].get('content') or ''},
                     {'role':'user','content':json.dumps(observation,allow_nan=False)}])
    actions.append({'step':index,'tool':name,'status':observation.get('status'),
                    'artifact_sha256':observation.get('artifact_sha256')})
assert usage==summary['usage']
assert len(responses)==summary['steps'] and len(responses)<=config['max_steps']
assert task.finish()==summary['task']
assert accounting_totals==summary['submission_accounting']
original_task=source/'output/task'
for path in (out/'replayed-task').glob('attempt-*.json'):
    assert json.loads(path.read_text())==json.loads((original_task/path.name).read_text()),path.name
run=json.loads((source/'run.json').read_text())
assert run['container_absent'] and not run['gpu_processes_after']
result={'format':'kiln-native-agent-batch-audit/2','status':'passed','model':summary['model'],
        'framework_revision':bundle['framework_revision'],'source_revision':bundle['source_revision'],
        'exit_reason':summary['exit_reason'],'usage':usage,'actions':actions,
        'task':summary['task'],'submission_accounting':accounting_totals,'container_absent':True,'gpu_processes_after':'',
        'scope':'Raw-response/tool/budget replay; no compiler correctness or speedup claim'}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
