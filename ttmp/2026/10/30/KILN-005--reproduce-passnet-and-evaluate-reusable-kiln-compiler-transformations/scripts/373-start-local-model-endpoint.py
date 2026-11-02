#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/372-launch-local-original-model-server.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/372-launch-local-original-model-server.py --root '+base
command='test ! -e '+base+'/model-server-v1.json && ! tmux has-session -t passnet-original-model-server-v1 2>/dev/null && tmux new-session -d -s passnet-original-model-server-v1 '+shlex.quote('sg docker -c '+shlex.quote(inner)+' > '+base+'/model-server-driver-v1.log 2>&1')
subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling',command],check=True)
