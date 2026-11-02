#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];local=p/'sources/agent-runtime-bootstrap-v1';base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
for name in ['r2e-locked-requirements.txt','lock-export-v1.json']:
 subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(local/name),'manuel@bling:'+base+'/'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/362-install-original-framework-lock.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/362-install-original-framework-lock.py --root '+base
command='test ! -e '+base+'/agent-locked-environment-v1.json && ! tmux has-session -t passnet-agent-locked-env-v1 2>/dev/null && tmux new-session -d -s passnet-agent-locked-env-v1 '+shlex.quote(inner+' > '+base+'/agent-locked-driver-v1.log 2>&1')
subprocess.run(ssh+[command],check=True);print('Started original uv.lock dependency installation; no agent/controller source edits')
