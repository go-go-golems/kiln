#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
# The observed missing session and ModuleNotFoundError are terminal evidence,
# not an observation timeout or a reason to start a duplicate live job.
subprocess.run(ssh+['! tmux has-session -t passnet-singleton-qualification-v1 2>/dev/null'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/406-recover-singleton-runtime-path.sh'),'manuel@bling:'+base+'/'],check=True)
inner='bash '+base+'/406-recover-singleton-runtime-path.sh';command='test ! -e '+base+'/singleton-view-qualification-v2.log && ! tmux has-session -t passnet-singleton-qualification-v2 2>/dev/null && tmux new-session -d -s passnet-singleton-qualification-v2 '+shlex.quote('sg docker -c '+shlex.quote(inner)+' > '+base+'/singleton-view-qualification-v2.log 2>&1')
subprocess.run(ssh+[command],check=True);print('Started diagnosed path recovery; retained compiled artifacts and failed import log')
