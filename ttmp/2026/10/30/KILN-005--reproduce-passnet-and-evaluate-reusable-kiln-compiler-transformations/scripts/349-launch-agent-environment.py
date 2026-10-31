#!/usr/bin/env python3
"""Stage untouched PassAgent source and launch one isolated dependency installation."""
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];rsh='ssh -o HostKeyAlias=bling.local'
subprocess.run(ssh+['mkdir -p '+base+'/passnet-pristine/pass_agent'],check=True)
subprocess.run(['rsync','-a','-e',rsh,'--exclude=__pycache__/','--exclude=*.pyc','--exclude=trajectories/','--exclude=run_logs/',str(p/'sources/upstream/pass_agent')+'/','manuel@bling:'+base+'/passnet-pristine/pass_agent/'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/347-install-pinned-agent-environment.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/347-install-pinned-agent-environment.py --root '+base
command='test ! -e '+base+'/agent-environment-v1.json && ! tmux has-session -t passnet-agent-env-v1 2>/dev/null && tmux new-session -d -s passnet-agent-env-v1 '+shlex.quote(inner+' > '+base+'/agent-environment-driver-v1.log 2>&1')
subprocess.run(ssh+[command],check=True)
print('Started isolated PassAgent dependency installation')
