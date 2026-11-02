"""Collect completed paired evidence and run the shared PassBench task auditor."""
import json
import subprocess
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
repo = Path.cwd()
study = ticket / 'sources/fixed-policy-passbench-v1'
remote = 'manuel@bling:/home/manuel/passnet-kiln/KILN-005/sources/fixed-policy-passbench-v1/'
rsh = 'ssh -o HostKeyAlias=bling.local'
for arm in ['baseline', 'candidate']:
    destination = study / arm
    assert not destination.exists(), f'Preserve prior collection: {destination}'
    subprocess.run(['rsync', '-a', '-e', rsh, remote + arm + '/', str(destination) + '/'], check=True)
    run = json.loads((destination / 'run.json').read_text())
    assert run['status'] == 'complete', f'{arm} run is incomplete'
    subprocess.run(['python3', 'integrations/passnet/summarize_task_run.py',
                    '--directory', str(destination), '--upstream', str(ticket / 'sources/upstream'),
                    '--output', str(study / (arm + '-audit.json'))], cwd=repo, check=True)
subprocess.run(['rsync', '-a', '-e', rsh, remote + 'owner.log', str(study / 'owner.log')], check=True)
