#!/usr/bin/env python3
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
for label,version,prior,filename,receipt in [('agent-image','v3','v2','358-assemble-agent-image-from-local-id.py','agent-image-v3.json'),('agent-env','v2','v1','359-recover-agent-dependency-download.py','agent-environment-v2.json')]:
 subprocess.run(ssh+['! tmux has-session -t passnet-'+label+'-'+prior+' 2>/dev/null'],check=True)
 subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts'/filename),'manuel@bling:'+base+'/scripts/'],check=True)
 inner='python3 '+base+'/scripts/'+filename+' --root '+base
 if label=='agent-image':inner='sg docker -c '+shlex.quote(inner)
 command='test ! -e '+base+'/'+receipt+' && tmux new-session -d -s passnet-'+label+'-'+version+' '+shlex.quote(inner+' > '+base+'/'+label+'-driver-'+version+'.log 2>&1')
 subprocess.run(ssh+[command],check=True);print('Started diagnosed recovery',label,version,flush=True)
