#!/usr/bin/env python3
"""Stage a minimal image context and launch its single tracked build."""
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];local=p/'sources/agent-runtime-bootstrap-v1';base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];rsh='ssh -o HostKeyAlias=bling.local'
for name in ['Dockerfile.agent','passnet-agent-context-v1.tar.gz','agent-context-manifest.json','wheels']:
 subprocess.run(['rsync','-a','-e',rsh,str(local/name),'manuel@bling:'+base+'/'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/351-build-original-agent-image.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='sg docker -c '+shlex.quote('python3 '+base+'/scripts/351-build-original-agent-image.py --root '+base)
command='test ! -e '+base+'/agent-image-v1.json && ! tmux has-session -t passnet-agent-image-v1 2>/dev/null && tmux new-session -d -s passnet-agent-image-v1 '+shlex.quote(inner+' > '+base+'/agent-image-driver-v1.log 2>&1')
subprocess.run(ssh+[command],check=True);print('Started dedicated original agent image build')
