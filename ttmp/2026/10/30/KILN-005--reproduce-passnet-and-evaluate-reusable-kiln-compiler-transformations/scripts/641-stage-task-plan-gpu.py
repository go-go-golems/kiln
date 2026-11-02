"""Stage a frozen PassBench task plan and Kiln source snapshot without GPU work."""

import argparse
import hashlib
import json
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
sources = ticket / 'sources'
upstream = sources / 'upstream'
sys.path.insert(0, str(repo / 'integrations/passnet'))
from evaluate_tasks import snapshot

parser = argparse.ArgumentParser()
parser.add_argument('--name', required=True, help='study directory name, e.g. stack-unbind-batch-gpu-v1')
parser.add_argument('--plan', required=True, type=Path, help='task plan JSON, relative to ticket')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', args.name):
    parser.error('--name must be a simple lowercase slug')
plan_path = (ticket / args.plan).resolve()
if not plan_path.is_relative_to(ticket) or not plan_path.is_file():
    parser.error('--plan must name an existing file in the ticket')
plan = json.loads(plan_path.read_text())
if plan.get('format') != 'kiln-task-plan/1' or not plan.get('tasks'):
    parser.error('--plan must contain nonempty kiln-task-plan/1 tasks')
study = sources / args.name
if study.exists():
    parser.error('study already exists; preserve the prior staging receipt')

base = '/home/manuel/passnet-kiln/KILN-005/sources/' + args.name
dest = 'manuel@bling:' + base
ssh = ['ssh', '-o', 'HostKeyAlias=bling.local', 'manuel@bling']
rsh = 'ssh -o HostKeyAlias=bling.local'
state = snapshot(repo)
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
for name, want in state['files'].items():
    actual = hashlib.sha256(subprocess.check_output(['git', 'show', revision + ':' + name])).hexdigest()
    if actual != want:
        raise RuntimeError(f'uncommitted source snapshot file: {name}')
subprocess.run(ssh + ['mkdir -p ' + shlex.quote(base)], check=True)
files = list(state['files']) + ['package.json', 'packages/kiln/package.json', 'packages/evidence/package.json']
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(files) + '\n')
    listing.flush()
    subprocess.run(['rsync', '-a', '-e', rsh, '--files-from=' + listing.name,
                    str(repo) + '/', dest + '/kiln/'], check=True)
setup = (f'mkdir -p {base}/kiln/node_modules/@kiln && '
         f'ln -sfn ../../packages/kiln {base}/kiln/node_modules/@kiln/kiln && '
         f'ln -sfn ../../packages/evidence {base}/kiln/node_modules/@kiln/evidence && '
         f'ln -sfn /home/manuel/passnet-kiln/KILN-005/kiln/packages/kiln/node_modules/acorn {base}/kiln/node_modules/acorn')
subprocess.run(ssh + [setup], check=True)
paths = ['pass_bench/']
for task in plan['tasks']:
    membership = (upstream / task['sample'] / 'graph_list.txt').read_bytes()
    if hashlib.sha256(membership).hexdigest() != task['graph_list_sha256']:
        raise RuntimeError(f'graph membership changed for task {task["index"]}')
    graphs = membership.decode().splitlines()
    if len(graphs) != task['graphs']:
        raise RuntimeError(f'graph count changed for task {task["index"]}')
    paths.append(task['sample'] + '/')
    paths.extend(graph + '/' for graph in graphs)
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(sorted(set(paths))) + '\n')
    listing.flush()
    subprocess.run(['rsync', '-ar', '-e', rsh, '--files-from=' + listing.name,
                    '--exclude=__pycache__/', '--exclude=*.pyc',
                    str(upstream) + '/', dest + '/upstream/'], check=True)
subprocess.run(['rsync', '-a', '-e', rsh, str(plan_path), dest + '/plan.json'], check=True)
subprocess.run(['rsync', '-a', '-e', rsh, str(ticket / 'scripts/642-run-task-plan-gpu.sh'),
                dest + '/run.sh'], check=True)
code = ('import json,sys;from pathlib import Path;sys.path.insert(0,'
        + repr(base + '/kiln/integrations/passnet') + ');from evaluate_tasks import snapshot;'
        + 'print(json.dumps(snapshot(Path(' + repr(base + '/kiln') + '))))')
remote_state = json.loads(subprocess.check_output(ssh + ['python3 -c ' + shlex.quote(code)], text=True))
if remote_state != state:
    raise RuntimeError('remote source snapshot mismatch')
receipt = {'format': 'kiln-task-plan-gpu-staging/1', 'source_revision': revision,
           'source_snapshot': state, 'remote': base,
           'plan_file': str(plan_path.relative_to(ticket)),
           'plan_sha256': hashlib.sha256(plan_path.read_bytes()).hexdigest(),
           'tasks': len(plan['tasks']), 'graphs': sum(row['graphs'] for row in plan['tasks']),
           'status': 'staged; not launched'}
study.mkdir()
(study / 'staging.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: value for key, value in receipt.items() if key != 'source_snapshot'} |
                 {'source_snapshot_sha256': state['sha256']}, indent=2))
