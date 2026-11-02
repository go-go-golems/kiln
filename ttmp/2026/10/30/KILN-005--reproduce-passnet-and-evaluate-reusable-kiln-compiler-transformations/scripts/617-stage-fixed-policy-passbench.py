"""Stage one frozen, paired compiler-policy study on bling."""
import hashlib
import json
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
sources = ticket / 'sources'
upstream = sources / 'upstream'
study = sources / 'fixed-policy-passbench-v1'
sys.path.insert(0, str(repo / 'integrations/passnet'))
from evaluate_tasks import snapshot

base = '/home/manuel/passnet-kiln/KILN-005/sources/fixed-policy-passbench-v1'
dest = 'manuel@bling:' + base
ssh = ['ssh', '-o', 'HostKeyAlias=bling.local', 'manuel@bling']
rsh = 'ssh -o HostKeyAlias=bling.local'
state = snapshot(repo)
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
for name, want in state['files'].items():
    committed = subprocess.check_output(['git', 'show', revision + ':' + name])
    assert hashlib.sha256(committed).hexdigest() == want, name
subprocess.run(ssh + ['mkdir ' + shlex.quote(base)], check=True)
files = list(state['files']) + ['package.json', 'packages/kiln/package.json', 'packages/evidence/package.json']
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(files) + '\n')
    listing.flush()
    subprocess.run(['rsync', '-a', '-e', rsh, '--files-from=' + listing.name,
                    str(repo) + '/', dest + '/kiln/'], check=True)
setup = (f'mkdir -p {base}/kiln/node_modules/@kiln && '
         f'ln -s ../../packages/kiln {base}/kiln/node_modules/@kiln/kiln && '
         f'ln -s ../../packages/evidence {base}/kiln/node_modules/@kiln/evidence && '
         f'ln -s /home/manuel/passnet-kiln/KILN-005/kiln/packages/kiln/node_modules/acorn {base}/kiln/node_modules/acorn')
subprocess.run(ssh + [setup], check=True)
plan = json.loads((study / 'baseline-plan.json').read_text())
paths = ['pass_bench/']
for task in plan['tasks']:
    paths.append(task['sample'] + '/')
    paths.extend(graph + '/' for graph in (upstream / task['sample'] / 'graph_list.txt').read_text().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(paths) + '\n')
    listing.flush()
    subprocess.run(['rsync', '-ar', '-e', rsh, '--files-from=' + listing.name,
                    '--exclude=__pycache__/', '--exclude=*.pyc',
                    str(upstream) + '/', dest + '/upstream/'], check=True)
for name in ['baseline-plan.json', 'candidate-plan.json', 'fixed-program.json']:
    subprocess.run(['rsync', '-a', '-e', rsh, str(study / name), dest + '/' + name], check=True)
subprocess.run(['rsync', '-a', '-e', rsh, str(ticket / 'scripts/616-run-fixed-policy-passbench.sh'),
                dest + '/run.sh'], check=True)
code = ('import json,sys;from pathlib import Path;sys.path.insert(0,'
        + repr(base + '/kiln/integrations/passnet') + ');from evaluate_tasks import snapshot;'
        + 'print(json.dumps(snapshot(Path(' + repr(base + '/kiln') + '))))')
actual = json.loads(subprocess.check_output(ssh + ['python3 -c ' + shlex.quote(code)], text=True))
assert actual == state
receipt = {'source_revision': revision, 'source_snapshot': state, 'remote': base,
           'tasks': len(plan['tasks']), 'graphs': sum(task['graphs'] for task in plan['tasks']),
           'policy_sha256': hashlib.sha256((study / 'fixed-program.json').read_bytes()).hexdigest()}
(study / 'staging.json').write_text(json.dumps(receipt, indent=2) + '\n')
command = 'sg docker -c ' + shlex.quote('bash ' + base + '/run.sh') + ' > ' + base + '/owner.log 2>&1'
subprocess.run(ssh + ['tmux new-session -d -s kiln-fixed-policy-passbench-v1 ' + shlex.quote(command)], check=True)
print(json.dumps(receipt | {'source_snapshot': state['sha256'], 'status': 'launched'}, indent=2))
