#!/usr/bin/env python3
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
remote=r'''
import json,os,signal,subprocess,time
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1');killed=[]
assert (p/'agent-locked-environment-v1.json').exists(),'Establish the original locked setup before superseding the unbounded attempt'
for path in Path('/proc').glob('[0-9]*/cmdline'):
 try:args=path.read_bytes().decode().split('\0')
 except (OSError,UnicodeDecodeError):continue
 if len(args)>3 and args[0]==str(p/'agent-venv/bin/python') and args[1:3]==['-m','pip']:
  pid=int(path.parent.name);os.kill(pid,signal.SIGTERM);killed.append(pid)
receipt={'scope':'Supersede unbounded transitive dependency selection before any inference; preserve existing source, logs, cache and environment; use original committed uv.lock instead','terminated_owned_pip_processes':killed}
path=p/'agent-unbounded-environment-superseded.json'
with path.open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
'''
r=subprocess.run(ssh+['python3 -'],input=remote,capture_output=True,text=True);r.check_returncode();(p/'sources/agent-runtime-bootstrap-v1/unbounded-environment-supersession.json').write_text(r.stdout)
subprocess.run(ssh+['! tmux has-session -t passnet-converter-env-v1 2>/dev/null'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/364-recover-converter-download.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/364-recover-converter-download.py --root '+base
subprocess.run(ssh+['test ! -e '+base+'/converter-environment-v2.json && tmux new-session -d -s passnet-converter-env-v2 '+shlex.quote(inner+' > '+base+'/converter-environment-driver-v2.log 2>&1')],check=True)
print('Original dependency lock is authoritative; started diagnosed converter retry')
