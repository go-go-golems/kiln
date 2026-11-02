#!/usr/bin/env python3
"""Install the converter's declared requirements in a separate CPU-only environment."""
import argparse,hashlib,json,subprocess,sys,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();receipt=root/'converter-environment-v1.json'
if receipt.exists():raise ValueError('Preserve previous converter environment')
source=root/'llama-src';requirements=source/'requirements/requirements-convert_hf_to_gguf.txt';assert requirements.exists()
venv=root/'converter-venv';python=venv/'bin/python';state={'format':'kiln-checkpoint-converter-environment/1','status':'running','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'requirements_sha256':hashlib.sha256(requirements.read_bytes()).hexdigest(),'phases':[]}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
commands=[('venv',[sys.executable,'-m','venv',str(venv)]),('install',[str(python),'-m','pip','--disable-pip-version-check','install','--cache-dir',str(root/'converter-pip-cache'),'-r',str(requirements),str(source/'gguf-py')])]
try:
 for name,command in commands:
  state['phase']=name;save();started=time.monotonic()
  with (root/('converter-'+name+'-v1.log')).open('w') as log:r=subprocess.run(command,cwd=source,stdout=log,stderr=subprocess.STDOUT)
  state['phases'].append({'name':name,'command':command,'returncode':r.returncode,'elapsed_seconds':time.monotonic()-started});save()
  if r.returncode:raise RuntimeError(name+' returned '+str(r.returncode))
 with (root/'converter-pip-freeze-v1.txt').open('w') as file:subprocess.run([str(python),'-m','pip','freeze','--all'],stdout=file,check=True)
 with (root/'converter-help-v1.log').open('w') as file:r=subprocess.run([str(python),str(source/'convert_hf_to_gguf.py'),'--help'],cwd=source,stdout=file,stderr=subprocess.STDOUT)
 state['phases'].append({'name':'converter_help','returncode':r.returncode})
 if r.returncode:raise RuntimeError('converter_help returned '+str(r.returncode))
 state.update(status='complete',freeze_sha256=hashlib.sha256((root/'converter-pip-freeze-v1.txt').read_bytes()).hexdigest())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
