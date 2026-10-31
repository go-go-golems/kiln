#!/usr/bin/env python3
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
remote="python3 -c "+shlex.quote("import urllib.request;print(urllib.request.urlopen('http://127.0.0.1:8041/health',timeout=10).read().decode())")
r=subprocess.run(ssh+[remote],capture_output=True,text=True);print(r.stdout,r.stderr)
if r.returncode:raise SystemExit(r.returncode)
assert json.loads(r.stdout)['status']=='ok'
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(p/'scripts/374-probe-local-chat-tools.py'),'manuel@bling:'+base+'/scripts/'],check=True)
inner='python3 '+base+'/scripts/374-probe-local-chat-tools.py --root '+base
command='test ! -e '+base+'/model-api-probe-v1.json && ! tmux has-session -t passnet-model-api-probe-v1 2>/dev/null && tmux new-session -d -s passnet-model-api-probe-v1 '+shlex.quote(inner+' > '+base+'/model-api-probe-driver-v1.log 2>&1')
subprocess.run(ssh+[command],check=True)
