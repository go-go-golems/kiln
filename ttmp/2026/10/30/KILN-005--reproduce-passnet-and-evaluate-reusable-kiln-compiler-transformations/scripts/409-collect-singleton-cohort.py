#!/usr/bin/env python3
"""Collect only a terminal cohort with unchanged committed source identity."""
import json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';expected=json.loads((s/'singleton-view-source-snapshot-v1.json').read_text());destination=s/'singleton-view-source-cohort-v1';assert not destination.exists();base='/home/manuel/passnet-kiln/KILN-005';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
remote=r'''
import json,subprocess,sys
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005');sys.path.insert(0,str(p/'kiln/integrations/passnet'));from evaluate_tasks import snapshot
run=json.loads((p/'singleton-view-source-cohort-v1/run.json').read_text());assert run['status']=='complete'
assert subprocess.run(['tmux','has-session','-t','passnet-singleton-qualification-v2'],capture_output=True).returncode!=0
actual=snapshot(p/'kiln');assert actual==run['source_snapshot'];print(json.dumps({'source_snapshot':actual,'terminal_records':len(run['records'])}))
'''
r=subprocess.run(ssh+['python3 -'],input=remote,text=True,capture_output=True,check=True);observed=json.loads(r.stdout);assert observed['source_snapshot']==expected['source_snapshot']
destination.mkdir();subprocess.run(['rsync','-a','-e','ssh -o HostKeyAlias=bling.local','--exclude=__pycache__/','manuel@bling:'+base+'/singleton-view-source-cohort-v1/',str(destination)+'/'],check=True)
for name in ['singleton-view-qualification-v1.log','singleton-view-qualification-v2.log']:
 r=subprocess.run(ssh+['cat '+base+'/'+name],capture_output=True,check=True)
 with (s/name).open('xb') as file:file.write(r.stdout)
with (s/'singleton-view-final-source-verification-v1.json').open('x') as file:file.write(json.dumps(observed,indent=2)+'\n')
print('Collected terminal',observed['terminal_records'],'task records and verified unchanged final source')
