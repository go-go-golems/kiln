#!/usr/bin/env python3
"""Install the upstream committed dependency lock, with artifact hashes enforced."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();receipt=root/'agent-locked-environment-v1.json'
if receipt.exists():raise ValueError('Preserve existing locked environment job')
export=json.loads((root/'lock-export-v1.json').read_text());requirements=root/'r2e-locked-requirements.txt';assert hashlib.sha256(requirements.read_bytes()).hexdigest()==export['requirements_sha256']
source=root/'r2e-src';assert hashlib.sha256((source/'uv.lock').read_bytes()).hexdigest()==export['lock_sha256'];venv=root/'agent-locked-venv';python=venv/'bin/python'
state={'format':'kiln-original-agent-locked-environment/1','status':'running','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'framework_revision':'0d94c4eb9431cd195c55a7ea3abd54006c9a1735','lock_sha256':export['lock_sha256'],'requirements_sha256':export['requirements_sha256'],'phases':[]}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
commands=[('venv',[sys.executable,'-m','venv',str(venv)]),('locked_dependencies',[str(python),'-m','pip','--disable-pip-version-check','--timeout','120','--retries','5','install','--cache-dir',str(root/'locked-pip-cache'),'--require-hashes','-r',str(requirements)]),('original_framework',[str(python),'-m','pip','--disable-pip-version-check','install','--no-deps',str(source)]),('editor_dependency',[str(python),'-m','pip','--disable-pip-version-check','install','--no-index','--no-deps','--find-links',str(root/'wheels'),'chardet==5.2.0'])]
try:
 for name,command in commands:
  state['phase']=name;save()
  with (root/('agent-locked-'+name+'-v1.log')).open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
  state['phases'].append({'name':name,'command':command,'returncode':r.returncode});save()
  if r.returncode:raise RuntimeError(name+' returned '+str(r.returncode))
 with (root/'agent-locked-pip-freeze-v1.txt').open('w') as file:subprocess.run([str(python),'-m','pip','freeze','--all'],stdout=file,check=True)
 code='import sys;sys.path.insert(0,'+repr(str(root/'passnet-pristine/pass_agent'))+');from runtime.passnet_docker import PassNetDocker;from agent.pass_agent import PassAgent;from r2egym.agenthub.agent.agent import AgentArgs;print("Pinned original PassAgent, runtime and AgentArgs import succeeded")'
 with (root/'agent-locked-import-v1.log').open('w') as file:r=subprocess.run([str(python),'-c',code],stdout=file,stderr=subprocess.STDOUT)
 state['phases'].append({'name':'original_import','returncode':r.returncode});save()
 if r.returncode:raise RuntimeError('Original import returned '+str(r.returncode))
 state.update(status='complete',freeze_sha256=hashlib.sha256((root/'agent-locked-pip-freeze-v1.txt').read_bytes()).hexdigest())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
