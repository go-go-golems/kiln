#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1'
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/382-set-executable-agent-entrypoint.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/382-set-executable-agent-entrypoint.py --root '+base
command='test ! -e '+base+'/agent-image-shell-v5.json && ! tmux has-session -t passnet-agent-shell-v5 2>/dev/null && tmux new-session -d -s passnet-agent-shell-v5 '+shlex.quote('sg docker -c '+shlex.quote(inner)+' > '+base+'/agent-image-shell-driver-v5.log 2>&1')
subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling',command],check=True)
