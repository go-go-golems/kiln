#!/usr/bin/env python3
"""Stage committed source and every declared GELU task/fixture with byte verification."""
import hashlib,json,shlex,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
s=p/'sources';up=s/'upstream';base='/home/manuel/passnet-kiln/KILN-005';dest='manuel@bling:'+base
ssh=['ssh','-o','HostKeyAlias=bling.local'];rsh='ssh -o HostKeyAlias=bling.local'
state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
for relative,digest in state['files'].items():
    raw=subprocess.check_output(['git','show',revision+':'+relative],cwd=repo)
    assert hashlib.sha256(raw).hexdigest()==digest,'Commit runtime sources before GPU qualification: '+relative
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(state['files'])+'\n');listing.flush()
    subprocess.run(['rsync','-a','-e',rsh,'--files-from='+listing.name,str(repo)+'/',dest+'/kiln/'],check=True)
plan=json.loads((s/'gelu-source-cohort-plan.json').read_text());directories=[]
for task in plan['tasks']:
    directories.append(task['sample']+'/')
    directories.extend(graph+'/' for graph in (up/task['sample']/'graph_list.txt').read_text().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as listing:
    listing.write('\n'.join(directories)+'\n');listing.flush()
    subprocess.run(['rsync','-ar','-e',rsh,'--files-from='+listing.name,'--exclude=__pycache__/','--exclude=*.pyc',str(up)+'/',dest+'/upstream/'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(s/'gelu-fixtures-v1'),str(s/'gelu-source-cohort-plan.json'),str(p/'scripts/315-run-gelu-validation.sh'),dest+'/'],check=True)
code='import json,sys;from pathlib import Path;sys.path.insert(0,'+repr(base+'/kiln/integrations/passnet')+');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path('+repr(base+'/kiln')+'))))'
actual=json.loads(subprocess.check_output(ssh+['manuel@bling','python3 -c '+shlex.quote(code)],text=True))
assert actual==state,'Remote runtime source mismatch'
receipt={'source_revision':revision,'source_snapshot':state,'remote_matches':True,'scope':'Common committed compiler/runtime and complete original task source staging before GPU qualification','task_plan_sha256':hashlib.sha256((s/'gelu-source-cohort-plan.json').read_bytes()).hexdigest()}
with (s/'gelu-source-snapshot-v1.json').open('x') as f:f.write(json.dumps(receipt,indent=2)+'\n')
print('Verified exact committed sources on DGX',revision)
