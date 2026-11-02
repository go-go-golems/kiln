#!/usr/bin/env python3
"""Recover a terminal pip transfer timeout without altering original framework code."""
import argparse,hashlib,json,subprocess,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();old=json.loads((root/'agent-environment-v1.json').read_text());assert old['status']=='failed' and 'ReadTimeoutError' in (root/'agent-install-v1.log').read_text()
receipt=root/'agent-environment-v2.json'
if receipt.exists():raise ValueError('Preserve prior recovery receipt')
python=root/'agent-venv/bin/python';source=root/'r2e-src';state={'format':'kiln-original-agent-environment/1','status':'running','framework_revision':old['framework_revision'],'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'recovery':'Retry only after terminal files.pythonhosted.org ReadTimeoutError; same original source and virtual environment','phases':[]}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save()
try:
 command=[str(python),'-m','pip','--disable-pip-version-check','--timeout','120','--retries','5','install','--cache-dir',str(root/'pip-cache'),str(source),'docker','chardet'];state['command']=command
 with (root/'agent-install-v2.log').open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 state['phases'].append({'name':'install','returncode':r.returncode});save()
 if r.returncode:raise RuntimeError('Dependency installation returned '+str(r.returncode))
 for name,command in [('agent-pip-freeze-v2.txt',[str(python),'-m','pip','freeze','--all']),('agent-pip-inspect-v2.json',[str(python),'-m','pip','inspect'])]:
  with (root/name).open('w') as file:subprocess.run(command,stdout=file,check=True)
 code='import sys;sys.path.insert(0,'+repr(str(root/'passnet-pristine/pass_agent'))+');from runtime.passnet_docker import PassNetDocker;from agent.pass_agent import PassAgent;print("Original PassAgent imports succeeded")'
 with (root/'agent-import-v2.log').open('w') as file:r=subprocess.run([str(python),'-c',code],stdout=file,stderr=subprocess.STDOUT)
 state['phases'].append({'name':'original_import','returncode':r.returncode});save()
 if r.returncode:raise RuntimeError('Original import returned '+str(r.returncode))
 state.update(status='complete',freeze_sha256=hashlib.sha256((root/'agent-pip-freeze-v2.txt').read_bytes()).hexdigest())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
