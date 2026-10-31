"""Wait for a tmux study and verified run files, then execute one staged task plan."""

import argparse
import json
import shlex
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--wait-session', required=True)
parser.add_argument('--require', nargs=2, action='append', metavar=('RUN_JSON', 'TASKS'), default=[])
parser.add_argument('--study', required=True, type=Path)
args = parser.parse_args()
study = args.study.resolve()
plan = json.loads((study / 'plan.json').read_text())
if plan.get('format') != 'kiln-task-plan/1' or not plan.get('tasks'):
    parser.error('staged study requires nonempty task plan')

while subprocess.run(['tmux', 'has-session', '-t', args.wait_session],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
    time.sleep(30)

for filename, expected in args.require:
    run = json.loads(Path(filename).read_text())
    if run.get('status') != 'complete' or len(run.get('records', [])) != int(expected):
        raise SystemExit(f'Prerequisite incomplete: {filename}')
print('PREREQUISITES COMPLETE', flush=True)

with (study / 'owner.log').open('w') as log:
    command = ['sg', 'docker', '-c', 'bash ' + shlex.quote(str(study / 'run.sh')) + ' ' + shlex.quote(str(study))]
    completed = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
if completed.returncode:
    raise SystemExit(f'Staged task runner failed: {completed.returncode}; see {study / "owner.log"}')
run = json.loads((study / 'results/run.json').read_text())
if run.get('status') != 'complete' or len(run.get('records', [])) != len(plan['tasks']):
    raise SystemExit('Staged task run did not account for every task')
print(f'STUDY COMPLETE: {len(plan["tasks"])} tasks accounted for', flush=True)
