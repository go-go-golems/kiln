#!/usr/bin/env python3
"""Stage the frozen three-arm cost-gate study on bling and launch it once the GPU queue is idle.

Copies the committed source snapshot, the task inputs, the three plans and two programs, verifies
the remote snapshot, writes a staging receipt and starts a tmux session that waits for any
--wait-session to end before running 668-run-cost-gate-arms.sh.
"""
import argparse, hashlib, json, shlex, subprocess, sys, tempfile
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
sources = ticket / 'sources'
upstream = sources / 'upstream'
study = sources / 'cost-gate-held-out-v1'
sys.path.insert(0, str(repo / 'integrations/passnet'))
from evaluate_tasks import snapshot

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--wait-session', action='append', default=[])
args = parser.parse_args()
if (study / 'staging.json').exists():
    parser.error('already staged; preserve the receipt')
base = '/home/manuel/passnet-kiln/KILN-005/sources/cost-gate-held-out-v1'
dest = 'manuel@bling:' + base
ssh = ['ssh', '-o', 'HostKeyAlias=bling.local', 'manuel@bling']
rsh = 'ssh -o HostKeyAlias=bling.local'
state = snapshot(repo)
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
for name, want in state['files'].items():
    if hashlib.sha256(subprocess.check_output(['git', 'show', revision + ':' + name])).hexdigest() != want:
        raise RuntimeError(f'uncommitted source snapshot file: {name}')
frozen = ['baseline-plan.json', 'always-plan.json', 'gated-plan.json', 'always-program.json', 'gated-program.json', 'declaration.json']
for name in frozen:
    if subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', str(study / name)]).returncode:
        raise RuntimeError(f'frozen file differs from the commit: {name}')
plans = {arm: json.loads((study / f'{arm}-plan.json').read_text()) for arm in ['baseline', 'always', 'gated']}
assert all({k: v for k, v in p.items() if k != 'optimization_program'} == {k: v for k, v in plans['baseline'].items()} for p in plans.values())
subprocess.run(ssh + ['mkdir ' + shlex.quote(base)], check=True)
files = list(state['files']) + ['package.json', 'packages/kiln/package.json', 'packages/evidence/package.json']
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(files) + '\n'); listing.flush()
    subprocess.run(['rsync', '-a', '-e', rsh, '--files-from=' + listing.name, str(repo) + '/', dest + '/kiln/'], check=True)
subprocess.run(ssh + [f'mkdir -p {base}/kiln/node_modules/@kiln && '
                      f'ln -sfn ../../packages/kiln {base}/kiln/node_modules/@kiln/kiln && '
                      f'ln -sfn ../../packages/evidence {base}/kiln/node_modules/@kiln/evidence && '
                      f'ln -sfn /home/manuel/passnet-kiln/KILN-005/kiln/packages/kiln/node_modules/acorn {base}/kiln/node_modules/acorn'], check=True)
paths = ['pass_bench/']
for task in plans['baseline']['tasks']:
    membership = (upstream / task['sample'] / 'graph_list.txt').read_bytes()
    assert hashlib.sha256(membership).hexdigest() == task['graph_list_sha256']
    paths.append(task['sample'] + '/'); paths.extend(g + '/' for g in membership.decode().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(sorted(set(paths))) + '\n'); listing.flush()
    subprocess.run(['rsync', '-ar', '-e', rsh, '--files-from=' + listing.name, '--exclude=__pycache__/', '--exclude=*.pyc',
                    str(upstream) + '/', dest + '/upstream/'], check=True)
for name in frozen:
    subprocess.run(['rsync', '-a', '-e', rsh, str(study / name), dest + '/' + name], check=True)
subprocess.run(['rsync', '-a', '-e', rsh, str(ticket / 'scripts/668-run-cost-gate-arms.sh'), dest + '/run.sh'], check=True)
code = ('import json,sys;from pathlib import Path;sys.path.insert(0,' + repr(base + '/kiln/integrations/passnet')
        + ');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path(' + repr(base + '/kiln') + '))))')
if json.loads(subprocess.check_output(ssh + ['python3 -c ' + shlex.quote(code)], text=True)) != state:
    raise RuntimeError('remote source snapshot mismatch')
wait = ' '.join(f'while tmux has-session -t {shlex.quote(s)} 2>/dev/null; do sleep 30; done;' for s in args.wait_session)
command = (wait + ' sg docker -c ' + shlex.quote('bash ' + base + '/run.sh ' + base) + ' > ' + base + '/owner.log 2>&1')
subprocess.run(ssh + ['tmux new-session -d -s kiln-cost-gate-held-out-v1 ' + shlex.quote(command)], check=True)
receipt = {'format': 'kiln-task-plan-gpu-staging/1', 'source_revision': revision, 'source_snapshot': state, 'remote': base,
           'arms': ['baseline', 'always', 'gated'], 'tasks': len(plans['baseline']['tasks']),
           'graphs': sum(t['graphs'] for t in plans['baseline']['tasks']),
           'frozen_sha256': {n: hashlib.sha256((study / n).read_bytes()).hexdigest() for n in frozen},
           'waits_for': args.wait_session, 'tmux_session': 'kiln-cost-gate-held-out-v1', 'status': 'launched'}
(study / 'staging.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k != 'source_snapshot'} | {'source_snapshot_sha256': state['sha256']}, indent=2))
