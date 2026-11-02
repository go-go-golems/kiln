#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/356-prepare-converter-environment.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/356-prepare-converter-environment.py --root '+base
command='test ! -e '+base+'/converter-environment-v1.json && ! tmux has-session -t passnet-converter-env-v1 2>/dev/null && tmux new-session -d -s passnet-converter-env-v1 '+shlex.quote(inner+' > '+base+'/converter-environment-driver-v1.log 2>&1')
subprocess.run(ssh+[command],check=True);print('Started isolated converter dependency setup')
