#!/usr/bin/env python3
"""Preserve a bounded authoritative observation without restarting a job."""
import argparse,json,re,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);args=parser.parse_args()
if not re.fullmatch('[a-zA-Z0-9-]+',args.tag):raise ValueError('Simple observation tag required')
remote=r'''
import hashlib,json,subprocess
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005');session='passnet-gelu-v3'
active=subprocess.run(['tmux','has-session','-t',session],capture_output=True).returncode==0
result={'session':session,'session_live':active,'log_tail':(p/'gelu-validation-v3.log').read_text().splitlines()[-12:]}
if active:result['pane']=subprocess.check_output(['tmux','list-panes','-t',session,'-F','#{pane_pid} #{pane_current_command} #{pane_dead}'],text=True).strip()
for name in ['gelu-cuda-validation-v1.json','gelu-source-cohort-v1/run.json']:
 path=p/name
 if path.exists():
  raw=path.read_bytes();data=json.loads(raw)
  result[name]={'sha256':hashlib.sha256(raw).hexdigest(),'status':data['status'],'records':len(data['records'])}
  if 'all_passed' in data:result[name]['all_passed']=data['all_passed']
  else:result[name]['phases']=[{'index':row['index'],'status':row['status'],'phase':row.get('current_phase')} for row in data['records']]
print(json.dumps(result,indent=2))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True)
receipt={'returncode':r.returncode,'stderr':r.stderr}
if r.returncode==0:receipt['observation']=json.loads(r.stdout)
else:receipt['transport_output']=r.stdout
path=p/'sources'/('gelu-remote-observation-'+args.tag+'.json')
with path.open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2));raise SystemExit(r.returncode)
