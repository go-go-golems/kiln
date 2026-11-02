#!/usr/bin/env python3
"""Use an explicit argument-forwarding executable after empty ENTRYPOINT was retained."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);root=parser.parse_args().root.resolve();receipt=root/'agent-image-shell-v5.json';assert not receipt.exists();old=json.loads((root/'agent-image-shell-v4.json').read_text());assert old['status']=='failed'
state={'format':'kiln-original-agent-shell-image/1','status':'running','source_image':old['source_image'],'tag':'kiln005-passagent:torch26.05-shell-v5','reason':'Docker commit retained container /bin/true ENTRYPOINT despite empty change. Explicit /usr/bin/env executes the original supplied CMD. No evaluator/source edits.','driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
def save():receipt.write_text(json.dumps(state,indent=2)+'\n')
save()
try:
 image=subprocess.check_output(['docker','commit','--change','ENTRYPOINT ["/usr/bin/env"]','--change','CMD ["/bin/bash", "-l"]',old['container'],state['tag']],text=True).strip();state['image_id']=image
 command=['docker','run','--rm',image,'/bin/bash','-lc','test -d /workspace/passnet/pass_agent && printf original-shell-startup-ok']
 r=subprocess.run(command,check=True,capture_output=True,text=True);state['startup_probe']={'command':command,'stdout':r.stdout,'stderr':r.stderr};assert r.stdout=='original-shell-startup-ok',r.stdout
 original_layers=json.loads(subprocess.check_output(['docker','image','inspect',old['source_image']],text=True))[0]['RootFS']['Layers'];layers=json.loads(subprocess.check_output(['docker','image','inspect',image],text=True))[0]['RootFS']['Layers'];assert layers==original_layers,(layers,original_layers);state['source_layers_identical']=True
 for original,new in [('passagent-shipping-smoke.jsonl','passagent-shipping-smoke-shell-v5.jsonl'),('passagent-evaluation-200.jsonl','passagent-evaluation-200-shell-v5.jsonl')]:
  rows=[json.loads(line) for line in (root/original).read_text().splitlines()]
  for row in rows:row['docker_image']=state['tag']
  output=root/new;assert not output.exists();output.write_text(''.join(json.dumps(row)+'\n' for row in rows));state.setdefault('datasets',[]).append({'original':original,'output':new,'tasks':len(rows),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'change':'docker_image only'})
 state['status']='complete'
except Exception as error:state.update(status='failed',error=repr(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
