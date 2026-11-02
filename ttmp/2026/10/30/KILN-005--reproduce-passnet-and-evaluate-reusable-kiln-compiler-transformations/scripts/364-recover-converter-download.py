#!/usr/bin/env python3
"""Retry the proven terminal converter-install timeout with unchanged requirements."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();old=json.loads((root/'converter-environment-v1.json').read_text());assert old['status']=='failed' and 'ReadTimeoutError' in (root/'converter-install-v1.log').read_text()
receipt=root/'converter-environment-v2.json'
if receipt.exists():raise ValueError('Preserve converter recovery receipt')
python=root/'converter-venv/bin/python';source=root/'llama-src';requirements=source/'requirements/requirements-convert_hf_to_gguf.txt';assert hashlib.sha256(requirements.read_bytes()).hexdigest()==old['requirements_sha256']
state={'format':old['format'],'status':'running','requirements_sha256':old['requirements_sha256'],'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'recovery':'Same declared requirements and environment; longer timeout after terminal files.pythonhosted.org ReadTimeoutError'}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
command=[str(python),'-m','pip','--disable-pip-version-check','--timeout','120','--retries','5','install','--cache-dir',str(root/'converter-pip-cache'),'-r',str(requirements),str(source/'gguf-py')];state['command']=command;save()
try:
 with (root/'converter-install-v2.log').open('w') as log:r=subprocess.run(command,cwd=source,stdout=log,stderr=subprocess.STDOUT)
 state['returncode']=r.returncode;save()
 if r.returncode:raise RuntimeError('Converter dependencies returned '+str(r.returncode))
 with (root/'converter-pip-freeze-v2.txt').open('w') as file:subprocess.run([str(python),'-m','pip','freeze','--all'],stdout=file,check=True)
 with (root/'converter-help-v2.log').open('w') as file:r=subprocess.run([str(python),str(source/'convert_hf_to_gguf.py'),'--help'],cwd=source,stdout=file,stderr=subprocess.STDOUT)
 state['help_returncode']=r.returncode
 if r.returncode:raise RuntimeError('Converter help returned '+str(r.returncode))
 state.update(status='complete',freeze_sha256=hashlib.sha256((root/'converter-pip-freeze-v2.txt').read_bytes()).hexdigest())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
