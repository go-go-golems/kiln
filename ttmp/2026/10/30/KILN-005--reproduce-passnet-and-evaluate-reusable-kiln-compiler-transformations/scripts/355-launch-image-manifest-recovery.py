#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['! tmux has-session -t passnet-agent-image-v1 2>/dev/null'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/354-build-agent-image-with-manifest.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='sg docker -c '+shlex.quote('python3 '+base+'/scripts/354-build-agent-image-with-manifest.py --root '+base)
subprocess.run(ssh+['test ! -e '+base+'/agent-image-v2.json && tmux new-session -d -s passnet-agent-image-v2 '+shlex.quote(inner+' > '+base+'/agent-image-driver-v2.log 2>&1')],check=True)
print('Started manifest-reference recovery of the terminal image-build failure')
