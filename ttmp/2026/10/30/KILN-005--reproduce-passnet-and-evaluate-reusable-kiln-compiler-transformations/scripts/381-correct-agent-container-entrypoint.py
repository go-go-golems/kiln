#!/usr/bin/env python3
"""Correct inherited image ENTRYPOINT; preserve original evaluator/source bytes."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);root=parser.parse_args().root.resolve();receipt=root/'agent-image-shell-v4.json';assert not receipt.exists()
old=json.loads((root/'agent-image-v3.json').read_text())['image_id'];name='kiln005-agent-shell-config-v4';tag='kiln005-passagent:torch26.05-shell'
def run(args):return subprocess.check_output(args,text=True).strip()
state={'format':'kiln-original-agent-shell-image/1','source_image':old,'tag':tag,'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'reason':'Inherited ENTRYPOINT [bash] interprets original runner CMD [/bin/bash,-l] as a script; clear ENTRYPOINT, retain CMD','status':'running'}
receipt.write_text(json.dumps(state,indent=2)+'\n')
try:
 state['container']=run(['docker','create','--name',name,'--entrypoint','/bin/true',old])
 state['image_id']=run(['docker','commit','--change','ENTRYPOINT []','--change','CMD ["/bin/bash", "-l"]',name,tag])
 probe=run(['docker','run','--rm',tag,'/bin/bash','-lc','test -d /workspace/passnet/pass_agent && printf original-shell-startup-ok'])
 assert probe=='original-shell-startup-ok';state['startup_probe']=probe
 for original,new in [('passagent-shipping-smoke.jsonl','passagent-shipping-smoke-shell-v4.jsonl'),('passagent-evaluation-200.jsonl','passagent-evaluation-200-shell-v4.jsonl')]:
  path=root/original
  # Full manifest may not yet have been staged; never manufacture missing input.
  if not path.exists():continue
  rows=[json.loads(line) for line in path.read_text().splitlines()]
  for row in rows:row['docker_image']=tag
  output=root/new;assert not output.exists();output.write_text(''.join(json.dumps(row)+'\n' for row in rows))
  state.setdefault('datasets',[]).append({'original':original,'output':new,'tasks':len(rows),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'change':'docker_image only'})
 state['status']='complete'
except Exception as error:state.update(status='failed',error=str(error));raise
finally:receipt.write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state,indent=2))
