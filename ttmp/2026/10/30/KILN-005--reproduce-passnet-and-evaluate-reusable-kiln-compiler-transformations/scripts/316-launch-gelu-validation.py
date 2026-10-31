#!/usr/bin/env python3
"""Launch one observed tmux job; preserve a host wrapper and never replace a live job."""
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005'
wrapper='''#!/usr/bin/env bash
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
bash /home/manuel/passnet-kiln/KILN-005/315-run-gelu-validation.sh
'''
local=p/'scripts/317-gelu-host-wrapper.sh'
with local.open('x') as file:file.write(wrapper)
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(local),'manuel@bling:'+base+'/'],check=True)
command='test ! -e '+shlex.quote(base+'/gelu-cuda-validation-v1.json')+' && test ! -d '+shlex.quote(base+'/gelu-source-cohort-v1')+' && ! tmux has-session -t passnet-gelu-v1 2>/dev/null && tmux new-session -d -s passnet-gelu-v1 '+shlex.quote('bash '+base+'/317-gelu-host-wrapper.sh > '+base+'/gelu-validation-v1.log 2>&1')
subprocess.run(ssh+[command],check=True)
subprocess.run(ssh+['tmux list-panes -t passnet-gelu-v1 -F "#{pane_pid} #{pane_current_command} #{pane_dead}"'],check=True)
print('Launched single tmux job passnet-gelu-v1')
