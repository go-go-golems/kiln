#!/usr/bin/env python3
"""Discover existing DGX resources through the explicitly supplied SSH endpoint."""
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1]
remote=r'''
import glob,json,shutil,socket,subprocess
checks={}
for port in [11434,8000,8001,8080]:
    connection=socket.socket();connection.settimeout(1)
    checks[str(port)]=connection.connect_ex(('127.0.0.1',port))==0;connection.close()
print(json.dumps({'host':socket.gethostname(),'images':subprocess.check_output(['docker','images','--format','{{.Repository}}:{{.Tag}} {{.Size}}'],text=True).splitlines(),'containers':subprocess.check_output(['docker','ps','--format','{{.Names}} {{.Image}}'],text=True).splitlines(),'model_paths':sum([glob.glob(pattern) for pattern in ['/home/manuel/.cache/huggingface/hub/models--*','/home/manuel/models','/opt/models','/home/manuel/.ollama/models/manifests']],[]),'runtime_paths':{name:shutil.which(name) for name in ['ollama','vllm','llama-server']},'local_service_ports':checks},indent=2))
'''
command=['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -']
r=subprocess.run(command,input=remote,text=True,capture_output=True)
receipt={'scope':'Read-only installed-image/cache/runtime/port discovery; no credential/environment values inspected; not exhaustive absence proof','command':command,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
path=p/'sources/passagent-local-runtime-discovery-v4.json'
with path.open('x') as f:f.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
