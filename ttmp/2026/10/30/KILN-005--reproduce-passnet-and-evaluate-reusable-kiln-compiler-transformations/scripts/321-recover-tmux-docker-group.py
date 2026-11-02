#!/usr/bin/env python3
"""Use the established docker group for the stale tmux server's child process."""
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
raw=subprocess.check_output(ssh+['cat '+base+'/gelu-validation-v2.log'],text=True)
assert 'permission denied' in raw and 'docker.sock' in raw
(p/'sources/gelu-launch-v2-failure.log').write_text(raw)
subprocess.run(ssh+['test ! -e '+base+'/gelu-cuda-validation-v1.json && test ! -d '+base+'/gelu-source-cohort-v1 && ! tmux has-session -t passnet-gelu-v2 2>/dev/null && sg docker -c '+shlex.quote('docker ps --format "{{.Names}}"')],check=True)
command='sg docker -c '+shlex.quote('bash '+base+'/318-run-gelu-validation-v2.sh')+' > '+base+'/gelu-validation-v3.log 2>&1'
subprocess.run(ssh+['tmux new-session -d -s passnet-gelu-v3 '+shlex.quote(command)],check=True)
print('Started passnet-gelu-v3 with the existing docker group; prior attempts were pre-GPU terminal failures')
