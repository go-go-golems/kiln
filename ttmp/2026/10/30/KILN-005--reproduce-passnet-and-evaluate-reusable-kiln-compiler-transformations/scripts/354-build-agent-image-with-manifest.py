#!/usr/bin/env python3
"""Recover the terminal FROM config-ID failure with the immutable registry reference."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();old=json.loads((root/'agent-image-v1.json').read_text());assert old['status']=='failed' and old['returncode']==1
assert 'failed to resolve source metadata' in (root/'agent-image-build-v1.log').read_text()
receipt=root/'agent-image-v2.json'
if receipt.exists():raise ValueError('Preserve existing recovery receipt')
base='localhost:5000/playback-redaction:base-26.05';inspect=json.loads(subprocess.check_output(['docker','image','inspect',base],text=True))[0];assert inspect['Id']==old['base_image_id']
reference=next(d for d in inspect['RepoDigests'] if d.startswith('localhost:5000/playback-redaction@sha256:'))
state={**{key:old[key] for key in ['format','base_image_id','source_context_sha256','dockerfile_sha256','image_tag']},'status':'building','from_reference':reference,'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'recovery':'FROM needs a repository/manifest reference, not an image config ID; source/context unchanged'}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
context=root/'agent-image-context-v1';assert hashlib.sha256((context/'Dockerfile.agent').read_bytes()).hexdigest()==state['dockerfile_sha256'];assert hashlib.sha256((context/'passnet-agent-context-v1.tar.gz').read_bytes()).hexdigest()==state['source_context_sha256']
command=['docker','build','--build-arg','BASE_IMAGE='+reference,'-f',str(context/'Dockerfile.agent'),'-t',state['image_tag'],str(context)];state['command']=command;save()
try:
 with (root/'agent-image-build-v2.log').open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 state['returncode']=r.returncode
 if r.returncode:raise RuntimeError('Image build returned '+str(r.returncode))
 assert json.loads(subprocess.check_output(['docker','image','inspect',base],text=True))[0]['Id']==state['base_image_id']
 state.update(status='complete',image_id=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',state['image_tag']],text=True).strip())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
