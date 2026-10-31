#!/usr/bin/env python3
"""Stage committed LayerNorm signature repair and launch the full seven-variant task."""
import hashlib,json,shlex,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
s=p/'sources';base='/home/manuel/passnet-kiln/KILN-005';dest='manuel@bling:'+base;rsh='ssh -o HostKeyAlias=bling.local';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
for name,digest in state['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+name],cwd=repo)).hexdigest()==digest,'Commit before staging: '+name
subprocess.run(ssh+['! tmux has-session -t passnet-gelu-v3 2>/dev/null && test ! -d '+base+'/gelu-layernorm-cohort-v1'],check=True)
with tempfile.NamedTemporaryFile(mode='w') as listing:
 listing.write('\n'.join(state['files'])+'\n');listing.flush()
 subprocess.run(['rsync','-a','-e',rsh,'--files-from='+listing.name,str(repo)+'/',dest+'/kiln/'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(s/'gelu-layernorm-replay-plan.json'),str(p/'scripts/330-run-layernorm-replay.sh'),dest+'/'],check=True)
code='import json,sys;from pathlib import Path;sys.path.insert(0,'+repr(base+'/kiln/integrations/passnet')+');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path('+repr(base+'/kiln')+'))))'
actual=json.loads(subprocess.check_output(ssh+['python3 -c '+shlex.quote(code)],text=True));assert actual==state
receipt={'source_revision':revision,'source_snapshot':state,'remote_matches':True,'task_plan_sha256':hashlib.sha256((s/'gelu-layernorm-replay-plan.json').read_bytes()).hexdigest()}
with (s/'gelu-layernorm-source-v1.json').open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
command='sg docker -c '+shlex.quote('bash '+base+'/330-run-layernorm-replay.sh')+' > '+base+'/gelu-layernorm-driver-v1.log 2>&1'
subprocess.run(ssh+['tmux new-session -d -s passnet-gelu-layernorm-v1 '+shlex.quote(command)],check=True)
print('Verified sources and launched the full seven-variant matching-repair task',revision)
