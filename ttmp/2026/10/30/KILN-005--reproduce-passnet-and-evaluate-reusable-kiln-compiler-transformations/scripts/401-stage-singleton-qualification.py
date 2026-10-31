#!/usr/bin/env python3
"""Stage only committed compiler sources and the full frozen singleton cohort."""
import hashlib,json,shlex,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').is_dir());sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
s=p/'sources';up=s/'upstream';base='/home/manuel/passnet-kiln/KILN-005';dest='manuel@bling:'+base;ssh=['ssh','-o','HostKeyAlias=bling.local'];rsh='ssh -o HostKeyAlias=bling.local'
# No shared source mutation while a prior evaluator or serving job is active.
check="test -z \"$(docker ps -q --filter name=kiln005-qwen-original-server-v1)\" && ! tmux has-session -t passnet-original-agent-smoke-v5 2>/dev/null && ! tmux has-session -t passnet-singleton-qualification-v1 2>/dev/null && ! tmux has-session -t passnet-singleton-qualification-v2 2>/dev/null"
subprocess.run(ssh+['manuel@bling',check],check=True)
state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
for relative,digest in state['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+relative],cwd=repo)).hexdigest()==digest,'Commit source before qualification: '+relative
with tempfile.NamedTemporaryFile(mode='w') as listing:
 listing.write('\n'.join(state['files'])+'\n');listing.flush();subprocess.run(['rsync','-a','-e',rsh,'--files-from='+listing.name,str(repo)+'/',dest+'/kiln/'],check=True)
plan=json.loads((s/'singleton-view-source-cohort-plan.json').read_text());directories=[]
for task in plan['tasks']:
 directories.append(task['sample']+'/');directories.extend(graph+'/' for graph in (up/task['sample']/'graph_list.txt').read_text().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as listing:
 listing.write('\n'.join(directories)+'\n');listing.flush();subprocess.run(['rsync','-ar','-e',rsh,'--files-from='+listing.name,'--exclude=__pycache__/','--exclude=*.pyc',str(up)+'/',dest+'/upstream/'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(s/'singleton-view-fixtures-v1'),str(s/'singleton-view-fixture-models-v1'),str(s/'singleton-view-source-cohort-plan.json'),str(p/'scripts/402-run-singleton-qualification.sh'),dest+'/'],check=True)
code='import json,sys;from pathlib import Path;sys.path.insert(0,'+repr(base+'/kiln/integrations/passnet')+');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path('+repr(base+'/kiln')+'))))'
actual=json.loads(subprocess.check_output(ssh+['manuel@bling','python3 -c '+shlex.quote(code)],text=True));assert actual==state
receipt={'format':'kiln-singleton-source-staging/1','source_revision':revision,'source_snapshot':state,'remote_matches':True,'plan_sha256':hashlib.sha256((s/'singleton-view-source-cohort-plan.json').read_bytes()).hexdigest(),'tasks':len(plan['tasks']),'graphs':sum(t['graphs'] for t in plan['tasks']),'inference_unloaded':True}
with (s/'singleton-view-source-snapshot-v1.json').open('x') as file:file.write(json.dumps(receipt,indent=2)+'\n')
print('Verified committed source staging',revision)
