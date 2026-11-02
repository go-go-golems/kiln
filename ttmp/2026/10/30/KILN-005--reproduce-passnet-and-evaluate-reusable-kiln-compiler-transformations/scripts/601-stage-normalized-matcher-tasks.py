"""Isolated compiler checkout for 16 complete original-evaluator task replays."""
import hashlib,json,shlex,subprocess,sys,tempfile
from pathlib import Path
T=Path(__file__).resolve().parent.parent;repo=Path.cwd();s=T/'sources';up=s/'upstream'
sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
base='/home/manuel/passnet-kiln/KILN-005/sources/normalized-matcher-qualification-v1';dest='manuel@bling:'+base
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];rsh='ssh -o HostKeyAlias=bling.local'
state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
for name,want in state['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+name])).hexdigest()==want,name
subprocess.run(ssh+['mkdir '+shlex.quote(base)],check=True)
files=list(state['files'])+['package.json','packages/kiln/package.json','packages/evidence/package.json']
with tempfile.NamedTemporaryFile(mode='w') as f:
 f.write('\n'.join(files)+'\n');f.flush();subprocess.run(['rsync','-a','-e',rsh,'--files-from='+f.name,str(repo)+'/',dest+'/kiln/'],check=True)
# Only third-party acorn is shared. Workspace package resolution stays in the
# isolated compiler checkout so imports cannot fall back to an older Kiln.
setup=f'mkdir -p {base}/kiln/node_modules/@kiln && ln -s ../../packages/kiln {base}/kiln/node_modules/@kiln/kiln && ln -s ../../packages/evidence {base}/kiln/node_modules/@kiln/evidence && ln -s /home/manuel/passnet-kiln/KILN-005/kiln/packages/kiln/node_modules/acorn {base}/kiln/node_modules/acorn'
subprocess.run(ssh+[setup],check=True)
plan=json.loads((s/'normalized-matcher-task-plan-v1.json').read_text());directories=['pass_bench/']
for task in plan['tasks']:
 directories.append(task['sample']+'/');directories.extend(g+'/' for g in (up/task['sample']/'graph_list.txt').read_text().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as f:
 f.write('\n'.join(directories)+'\n');f.flush();subprocess.run(['rsync','-ar','-e',rsh,'--files-from='+f.name,'--exclude=__pycache__/','--exclude=*.pyc',str(up)+'/',dest+'/upstream/'],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(s/'normalized-matcher-task-plan-v1.json'),dest+'/plan.json'],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(T/'scripts/602-run-normalized-matcher-tasks.sh'),dest+'/run.sh'],check=True)
code='import json,sys;from pathlib import Path;sys.path.insert(0,'+repr(base+'/kiln/integrations/passnet')+');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path('+repr(base+'/kiln')+'))))'
actual=json.loads(subprocess.check_output(ssh+['python3 -c '+shlex.quote(code)],text=True));assert actual==state
receipt={'source_revision':revision,'source_snapshot':state,'remote':base,'tasks':len(plan['tasks']),'graphs':sum(t['graphs'] for t in plan['tasks'])}
(s/'normalized-matcher-task-staging-v1.json').write_text(json.dumps(receipt,indent=2)+'\n')
command='sg docker -c '+shlex.quote('bash '+base+'/run.sh')+' > '+base+'/owner.log 2>&1'
subprocess.run(ssh+['tmux new-session -d -s kiln-normalized-matcher-tasks-v1 '+shlex.quote(command)],check=True)
print(json.dumps(receipt|{'source_snapshot':state['sha256'],'status':'launched'},indent=2))
