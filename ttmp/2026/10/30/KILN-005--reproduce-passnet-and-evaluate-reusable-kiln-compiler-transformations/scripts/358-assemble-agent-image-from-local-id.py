#!/usr/bin/env python3
"""Assemble the same workspace image through Docker Engine's existing local image ID."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);a=parser.parse_args();root=a.root.resolve();old=json.loads((root/'agent-image-v2.json').read_text());assert old['status']=='failed'
receipt=root/'agent-image-v3.json'
if receipt.exists():raise ValueError('Preserve existing assembly receipt')
context=root/'agent-image-context-v1';assert hashlib.sha256((context/'passnet-agent-context-v1.tar.gz').read_bytes()).hexdigest()==old['source_context_sha256']
base=old['base_image_id'];name='kiln005-agent-image-build-v3';probe=subprocess.run(['docker','container','inspect',name],capture_output=True);assert probe.returncode!=0,'Preserve existing assembly container'
script='''set -eu
mkdir -p /workspace/passnet
tar -xzf /bootstrap/passnet-agent-context-v1.tar.gz -C /workspace/passnet
python -m pip install --no-index --find-links=/bootstrap/wheels chardet==5.2.0
python -c 'import torch,triton,numpy,scipy,chardet;print(torch.__version__,triton.__version__,numpy.__version__,scipy.__version__,chardet.__version__)'
'''
state={'format':'kiln-original-agent-image/1','status':'building','base_image_id':base,'source_context_sha256':old['source_context_sha256'],'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'image_tag':old['image_tag'],'assembly_container':name,'assembly_script':script,'scope':'Same original workspace and dependency recipe; Docker Engine local-ID assembly avoids registry resolution; no evaluator/source edits'}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save()
try:
 command=['docker','run','--name',name,'-v',str(context)+':/bootstrap:ro','--entrypoint','bash',base,'-c',script];state['command']=command
 with (root/'agent-image-build-v3.log').open('w') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 state['returncode']=r.returncode
 if r.returncode:raise RuntimeError('Container assembly returned '+str(r.returncode))
 command=['docker','commit','--change','WORKDIR /workspace/passnet','--change','ENV PYTHONPATH=/workspace/passnet','--change','ENV PYTHONUNBUFFERED=1','--change','CMD ["/bin/bash", "-l"]',name,state['image_tag']]
 state['commit_command']=command;state['image_id']=subprocess.check_output(command,text=True).strip();state['status']='complete'
except Exception as error:state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
