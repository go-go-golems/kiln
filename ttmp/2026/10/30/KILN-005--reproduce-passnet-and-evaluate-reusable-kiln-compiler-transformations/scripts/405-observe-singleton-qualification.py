#!/usr/bin/env python3
"""Observe one named job and preserve bounded fixture/cohort state without restarting."""
import argparse,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);a=parser.parse_args();assert a.tag.replace('-','').isalnum();p=Path(__file__).resolve().parents[1]
remote=r'''
import json,subprocess
from pathlib import Path
root=Path('/home/manuel/passnet-kiln/KILN-005');session='passnet-singleton-qualification-v2';live=subprocess.run(['tmux','has-session','-t',session],capture_output=True).returncode==0;result={'session':session,'live':live}
if live:result['pane']=subprocess.check_output(['tmux','list-panes','-t',session,'-F','#{pane_pid} #{pane_current_command} #{pane_dead}'],text=True).strip()
for label,path in [('compile',root/'singleton-view-fixtures-v1/compile-receipt.json'),('fixtures',root/'singleton-view-fixtures-v1/gpu-random-receipt.json'),('cohort',root/'singleton-view-source-cohort-v1/run.json')]:
 if path.exists():
  try:
   value=json.loads(path.read_text())
   if isinstance(value,list):result[label]={'records':len(value),'all_passed':all(row.get('status')=='passed' for row in value) if label=='fixtures' else all(row.get('returncode')==0 for row in value),'output_comparisons':sum(len(row.get('output_max_abs_errors',[])) for row in value),'all_exact':all(all(error==0 for error in row.get('output_max_abs_errors',[])) for row in value) if label=='fixtures' else None}
   else:result[label]={'status':value.get('status'),'records':[{k:row.get(k) for k in ['index','status','current_phase']} for row in value.get('records',[])]}
  except json.JSONDecodeError as error:result[label]={'transient_read_error':str(error)}
for name in ['singleton-view-qualification-v2.log','singleton-view-fixture-compile-v1.log','singleton-view-fixture-cuda-v1.log','singleton-view-fixture-cuda-v2.log']:
 path=root/name
 if path.exists():result[name]=path.read_text(errors='replace').splitlines()[-8:]
print(json.dumps(result,indent=2))
'''
r=subprocess.run(['ssh','-o','HostKeyAlias=bling.local','manuel@bling','python3 -'],input=remote,text=True,capture_output=True);state={'returncode':r.returncode,'stderr':r.stderr,'observation':json.loads(r.stdout) if r.returncode==0 else r.stdout}
with (p/'sources'/('singleton-view-observation-'+a.tag+'.json')).open('x') as file:file.write(json.dumps(state,indent=2)+'\n')
print(json.dumps(state,indent=2));raise SystemExit(r.returncode)
