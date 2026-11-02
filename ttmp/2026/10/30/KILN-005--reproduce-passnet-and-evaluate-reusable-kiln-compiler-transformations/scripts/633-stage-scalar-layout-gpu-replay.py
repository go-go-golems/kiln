"""Stage the frozen five-family scalar/layout replay on bling without launching GPU work."""

import hashlib
import json
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
study = ticket / 'sources/scalar-layout-batch-gpu-v1'
upstream = ticket / 'sources/upstream'
plan_path = ticket / 'sources/scalar-layout-batch-task-plan-v1.json'
plan = json.loads(plan_path.read_text())
sys.path.insert(0, str(repo / 'integrations/passnet'))
from evaluate_tasks import snapshot

base = '/home/manuel/passnet-kiln/KILN-005/sources/scalar-layout-batch-gpu-v1'
dest = 'manuel@bling:' + base
ssh = ['ssh', '-o', 'HostKeyAlias=bling.local', 'manuel@bling']
rsh = 'ssh -o HostKeyAlias=bling.local'
state = snapshot(repo)
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
for name, want in state['files'].items():
    actual = hashlib.sha256(subprocess.check_output(['git', 'show', revision + ':' + name])).hexdigest()
    assert actual == want, name
study.mkdir(exist_ok=True)
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
    paths.append(task['sample'] + '/')
    paths.extend(graph + '/' for graph in (upstream / task['sample'] / 'graph_list.txt').read_text().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(sorted(set(paths))) + '\n')
    listing.flush()
    subprocess.run(['rsync', '-ar', '-e', rsh, '--files-from=' + listing.name,
                    '--exclude=__pycache__/', '--exclude=*.pyc',
                    str(upstream) + '/', dest + '/upstream/'], check=True)
subprocess.run(['rsync', '-a', '-e', rsh, str(plan_path), dest + '/plan.json'], check=True)
subprocess.run(['rsync', '-a', '-e', rsh, str(ticket / 'scripts/634-run-scalar-layout-gpu-replay.sh'),
                dest + '/run.sh'], check=True)
code = ('import json,sys;from pathlib import Path;sys.path.insert(0,'
        + repr(base + '/kiln/integrations/passnet') + ');from evaluate_tasks import snapshot;'
        + 'print(json.dumps(snapshot(Path(' + repr(base + '/kiln') + '))))')
remote_state = json.loads(subprocess.check_output(ssh + ['python3 -c ' + shlex.quote(code)], text=True))
assert remote_state == state
receipt = {'format': 'kiln-scalar-layout-gpu-staging/1', 'source_revision': revision,
           'source_snapshot': state, 'remote': base,
           'plan_sha256': hashlib.sha256(plan_path.read_bytes()).hexdigest(),
           'tasks': len(plan['tasks']), 'graphs': sum(row['graphs'] for row in plan['tasks']),
           'status': 'staged; not launched'}
(study / 'staging.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
