#!/usr/bin/env python3
"""Build a dedicated agent workspace image without changing original evaluator source."""
import argparse,hashlib,json,subprocess,tarfile,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();receipt=root/'agent-image-v1.json'
if receipt.exists():raise ValueError('Preserve original image-build receipt')
manifest=json.loads((root/'agent-context-manifest.json').read_text());archive=root/manifest['archive'];assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['archive_sha256']
context=root/'agent-image-context-v1';context.mkdir()
for name in ['Dockerfile.agent',manifest['archive']]:
 (context/name).write_bytes((root/name).read_bytes())
(context/'wheels').mkdir()
for file in (root/'wheels').iterdir():(context/'wheels'/file.name).write_bytes(file.read_bytes())
base=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}','localhost:5000/playback-redaction:base-26.05'],text=True).strip();image='kiln005-passagent:torch26.05'
state={'format':'kiln-original-agent-image/1','status':'building','base_image_id':base,'source_context_sha256':manifest['archive_sha256'],'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'dockerfile_sha256':hashlib.sha256((root/'Dockerfile.agent').read_bytes()).hexdigest(),'image_tag':image}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save();command=['docker','build','--build-arg','BASE_IMAGE='+base,'-f',str(context/'Dockerfile.agent'),'-t',image,str(context)];state['command']=command
try:
 with (root/'agent-image-build-v1.log').open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 state['returncode']=r.returncode
 if r.returncode:raise RuntimeError('Image build returned '+str(r.returncode))
 state.update(status='complete',image_id=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip())
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
