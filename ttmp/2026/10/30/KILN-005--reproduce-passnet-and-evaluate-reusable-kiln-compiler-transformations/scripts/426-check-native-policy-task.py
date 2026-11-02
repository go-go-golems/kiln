#!/usr/bin/env python3
"""Exercise trusted proposal intake and real compilation on historical training data.

This is an operational integration check, not an LLM run or fresh performance
experiment. Prior held-out members remain outside the compilation phase.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket = Path(__file__).resolve().parent.parent
repo = next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0, str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
from native_policy_task import NativePolicyTask

corpus = ticket/'sources/policy-corpus-v8-r2'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ticket/'sources/native-policy-task-check-v1')
args = parser.parse_args()
out = args.output.resolve()
out.mkdir()
initial = snapshot(repo)
default = {'format':'kiln-fusion-policy/1','id':'default','kind':'threshold','max_work_growth':1.02}
(out/'default.json').write_text(json.dumps(default)+'\n')


def compile_policy(policy, name):
    command = ['node', str(repo/'integrations/passnet/compile_policy.mjs'),
               '--directory',str(corpus),'--output',str(out/name),
               '--policy',str(policy),'--target','a100','--phase','train']
    result = subprocess.run(command, capture_output=True, text=True)
    (out/(name+'.stdout.txt')).write_text(result.stdout)
    (out/(name+'.stderr.txt')).write_text(result.stderr)
    if result.returncode:
        raise RuntimeError(f'Compilation failed: {name}; inspect retained logs')
    return json.loads((out/name/'compile-receipt.json').read_text())


reference = compile_policy(out/'default.json', 'reference')
manifest = json.loads((corpus/'manifest.json').read_text())
task = NativePolicyTask(out/'task',manifest,reference,proposal_budget=4)
results = [task.submit_policy('{'),task.submit_policy(json.dumps(default)),
           task.submit_policy(json.dumps({**default,'id':'rename'})),
           task.submit_policy(json.dumps({**default,'id':'disabled','max_work_growth':0}))]
assert [r['status'] for r in results] == ['rejected','accepted','duplicate','accepted']
assert task.finish()['unique_artifacts'] == 2
compiled = {}
for number in [2,4]:
    artifact = json.loads((out/f'task/attempt-{number:04d}.artifact.json').read_text())
    path = out/f'candidate-{number}.json'
    path.write_text(json.dumps(artifact['program'])+'\n')
    compiled[number] = compile_policy(path, f'candidate-{number}')
assert snapshot(repo) == initial, 'Sources changed during the check'
def fingerprints(receipt):
    return [r['fingerprint'] for r in receipt['records']]
assert fingerprints(reference) == fingerprints(compiled[2]), 'Artifact replay changed default executable'
changed = [r['graph'] for r, c in zip(reference['records'],compiled[4]['records']) if r['fingerprint'] != c['fingerprint']]
assert changed, 'Disabled policy did not change any executable'
for receipt in [reference,*compiled.values()]:
    assert receipt['phase'] == 'train'
    assert [r['graph'] for r in receipt['records']] == [r['graph'] for r in manifest['variants'] if r['split']=='train']
    assert all(r['status']=='compiled' and r['reference_check'].get('ok') is True for r in receipt['records'])
summary = {'format':'kiln-native-policy-task-check/1', 'status':'passed',
           'scope':'Historical training-only operational check; no external model, native CUDA or performance measurement',
           'base_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),
           'working_source_snapshot':initial,
           'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           'training_graphs':len(reference['records']), 'proposal_results':results,
           'default_replay_same_executables':True, 'disabled_changed_graphs':changed}
(out/'result.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({key:value for key,value in summary.items() if key not in ['working_source_snapshot','disabled_changed_graphs']},indent=2))
