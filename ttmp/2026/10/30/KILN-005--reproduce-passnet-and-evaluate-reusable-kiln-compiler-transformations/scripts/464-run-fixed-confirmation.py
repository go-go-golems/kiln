#!/usr/bin/env python3
"""Run a fixed transferred policy on the confirmation corpus using the existing evaluator."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

root=Path(__file__).resolve().parent
bundle=json.loads((root/'bundle.json').read_text())
assert re.fullmatch('[a-z0-9-]+',bundle['name'])
receipt=root/'run.json'
if receipt.exists():raise ValueError('Preserve existing measurement run')
state={'format':'kiln-policy-search-owned-measurement/1','status':'verifying',
       'source_revision':bundle['source_revision'],'phase':bundle['phase'],
       'membership_sha256':bundle['membership_sha256']}
def save():
    temporary=receipt.with_suffix('.tmp');temporary.write_text(json.dumps(state,indent=2)+'\n');temporary.replace(receipt)
def gpu_processes():
    return subprocess.check_output(['nvidia-smi','--query-compute-apps=pid,process_name,used_gpu_memory','--format=csv,noheader'],text=True).strip()
name='kiln005-'+bundle['name']
image='sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba'
save()
try:
    for relative,want in bundle['files_sha256'].items():
        assert hashlib.sha256((root/relative).read_bytes()).hexdigest()==want,relative
    assert bundle['phase'] in ['train','heldout']
    assert not gpu_processes(),'GPU activity present; preserve run without measuring'
    assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0,'Container name already exists'
    state['gpu_before']=subprocess.check_output(['nvidia-smi'],text=True)
    output=root/'output';output.mkdir()
    command=['docker','run','--rm','--name',name,'--gpus','all',
             '-v',str(root)+':/work:ro','-v',str(output)+':/results',
             '-w','/work/repo/integrations/passnet',
             '-e','PYTHONPATH=/work/repo/integrations/passnet:/work/repo/runtime/python:/work/upstream',
             '--entrypoint','python',image,'/work/reference.py','--corpus','/work/corpus',
             '--artifacts','/work/artifacts','--upstream','/work/upstream',
             '--output','/results/measurement.json','--phase',bundle['phase'],
             '--include-path','/usr/local/cuda/include']
    if bundle['phase']=='heldout':command+=['--selection','/work/selection.json']
    state.update(status='measuring',command=command);save()
    with (root/'measurement.stdout.txt').open('x') as log:
        result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
    state['returncode']=result.returncode
    measurement=output/'measurement.json'
    data=json.loads(measurement.read_text()) if measurement.exists() else {}
    state.update(status='complete' if result.returncode==0 and data.get('status')=='complete' else 'failed',
                 measured_graphs=len(data.get('records',[])))
    # A completed evaluator can contain candidate failures; selection decides eligibility.
    for relative,want in bundle['files_sha256'].items():
        assert hashlib.sha256((root/relative).read_bytes()).hexdigest()==want,'Input changed: '+relative
except Exception as error:state.update(status='failed',error_type=type(error).__name__,error=str(error))
finally:
    state['container_absent']=subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
    state['gpu_processes_after']=gpu_processes();save()
    print(json.dumps(state,indent=2),flush=True)
if state['status']!='complete':raise SystemExit(1)
