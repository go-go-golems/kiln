#!/usr/bin/env python3
"""Preserve actual job/session and byte-progress observations; never restart jobs."""
import argparse,json,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);args=parser.parse_args();assert re.fullmatch('[a-zA-Z0-9-]+',args.tag)
p=Path(__file__).resolve().parents[1]
remote=r'''
import json,subprocess
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1');result={}
for label,receipt,session in [('model-build','server-build-v1.json','passnet-model-build-v1'),('model-download','model-download-v1.json','passnet-model-download-v1'),('agent-env','agent-environment-v2.json','passnet-agent-env-v2'),('agent-image','agent-image-v3.json','passnet-agent-image-v3'),('converter-env','converter-environment-v2.json','passnet-converter-env-v2'),('agent-locked-env','agent-locked-environment-v1.json','passnet-agent-locked-env-v1')]:
 session=session;live=subprocess.run(['tmux','has-session','-t',session],capture_output=True).returncode==0;row={'session':session,'live':live}
 if live:row['pane']=subprocess.check_output(['tmux','list-panes','-t',session,'-F','#{pane_pid} #{pane_current_command} #{pane_dead}'],text=True).strip()
 path=p/receipt
 if path.exists():
  data=json.loads(path.read_text());row.update(status=data['status'],phase=data.get('phase'),error=data.get('error'))
  if 'files' in data:
   row.update(bytes=sum(item.get('bytes',0) for item in data['files'].values()),expected_bytes=data['expected_bytes'],verified=sum(item['status']=='verified' for item in data['files'].values()),files=len(data['files']))
   row['file_states']={name:{k:value for k,value in state.items() if k in ['status','bytes','error','last_error']} for name,state in data['files'].items() if state['status'] not in ['pending','verified']}
 for name in [('agent-env-driver-v2.log' if label=='agent-env' else 'agent-image-driver-v3.log' if label=='agent-image' else 'converter-environment-driver-v2.log' if label=='converter-env' else 'agent-locked-driver-v1.log' if label=='agent-locked-env' else label+'-driver-v1.log'),'server-configure-v1.log' if label=='model-build' else 'unused','server-build-v1.log' if label=='model-build' else 'agent-install-v2.log' if label=='agent-env' else 'unused','agent-venv-v1.log' if label=='agent-env' else 'agent-image-build-v3.log' if label=='agent-image' else 'converter-install-v2.log' if label=='converter-env' else 'unused','agent-locked-locked_dependencies-v1.log' if label=='agent-locked-env' else 'agent-import-v2.log' if label=='agent-env' else 'converter-help-v2.log' if label=='converter-env' else 'unused']:
  path=p/name
  if path.exists():row[name]=path.read_text(errors='replace').splitlines()[-8:]
 result[label]=row
print(json.dumps(result,indent=2))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True)
value={'returncode':r.returncode,'stderr':r.stderr,'observation':json.loads(r.stdout) if r.returncode==0 else r.stdout}
with (p/'sources/agent-runtime-bootstrap-v1'/('observation-'+args.tag+'.json')).open('x') as file:file.write(json.dumps(value,indent=2)+'\n')
print(json.dumps(value,indent=2));raise SystemExit(r.returncode)
