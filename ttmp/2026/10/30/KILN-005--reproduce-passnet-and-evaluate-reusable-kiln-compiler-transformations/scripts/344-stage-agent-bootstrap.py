#!/usr/bin/env python3
"""Stage frozen bootstrap inputs, require absent jobs, launch observed preparations."""
import shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];rsh='ssh -o HostKeyAlias=bling.local'
subprocess.run(ssh+['mkdir -p '+shlex.quote(base)+'/scripts'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(p/'sources/agent-runtime-bootstrap-v1')+'/','manuel@bling:'+base+'/'],check=True)
for filename in ['342-build-pinned-llama-server.py','343-download-original-model.py']:
 subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts'/filename),'manuel@bling:'+base+'/scripts/'],check=True)
for label,script,receipt in [('model-build','342-build-pinned-llama-server.py','server-build-v1.json'),('model-download','343-download-original-model.py','model-download-v1.json')]:
 session='passnet-'+label+'-v1';inner='python3 '+base+'/scripts/'+script+' --root '+base
 if label=='model-build':inner='sg docker -c '+shlex.quote(inner)
 command='test ! -e '+shlex.quote(base+'/'+receipt)+' && ! tmux has-session -t '+shlex.quote(session)+' 2>/dev/null && tmux new-session -d -s '+shlex.quote(session)+' '+shlex.quote(inner+' > '+base+'/'+label+'-driver-v1.log 2>&1')
 subprocess.run(ssh+[command],check=True)
 print('Launched',session,flush=True)
