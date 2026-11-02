"""Stage a fixed six-graph candidate, preserving original-evaluator inputs."""
import hashlib,json,shlex,subprocess,sys,tempfile
from pathlib import Path
T=Path(__file__).resolve().parent.parent;repo=Path.cwd();s=T/'sources';up=s/'upstream'
sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
base='/home/manuel/passnet-kiln/KILN-005/sources/pointwise-pooling-evaluation-v2';dest='manuel@bling:'+base
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];rsh='ssh -o HostKeyAlias=bling.local'
state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
for name,want in state['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+name])).hexdigest()==want,name
plan=json.loads((s/'avg-pooling-task-plan-v1.json').read_text());plan['tasks']=[t for t in plan['tasks'] if t['index']==101];plan['selection']='Fixed development family for opt-in pointwise convolution plus staged fusion; no fresh generalization claim.'
subprocess.run(ssh+['mkdir '+shlex.quote(base)],check=True)
with tempfile.NamedTemporaryFile(mode='w') as f:
 f.write('\n'.join(list(state['files'])+['package.json','packages/kiln/package.json','packages/evidence/package.json'])+'\n');f.flush();subprocess.run(['rsync','-a','-e',rsh,'--files-from='+f.name,str(repo)+'/',dest+'/kiln/'],check=True)
# GPU replay needs Python sources only; no Node compilation runs remotely.
directories=['pass_bench/']
for task in plan['tasks']:
 directories.append(task['sample']+'/');directories.extend(g+'/' for g in (up/task['sample']/'graph_list.txt').read_text().splitlines())
with tempfile.NamedTemporaryFile(mode='w') as f:
 f.write('\n'.join(directories)+'\n');f.flush();subprocess.run(['rsync','-ar','-e',rsh,'--files-from='+f.name,'--exclude=__pycache__/','--exclude=*.pyc',str(up)+'/',dest+'/upstream/'],check=True)
subprocess.run(ssh+['mkdir -p '+base+'/results/task-101'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(s/'pointwise-pooling-candidate-v1/corpus'),dest+'/results/task-101/'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(s/'avg-pooling-task-results-v1/task-101/passes'),dest+'/results/task-101/'],check=True)
files={str(p.relative_to(s/'pointwise-pooling-candidate-v1')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (s/'pointwise-pooling-candidate-v1/corpus').iterdir() if p.is_file()}
passes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (s/'avg-pooling-task-results-v1/task-101/passes').iterdir() if p.is_file()}
bundle={'passes_sha256':passes,'source_revision':revision,'source_snapshot':state,'plan':plan,'candidate_sha256':files,'remote':base}
path=s/'pointwise-pooling-staging-v2.json';path.write_text(json.dumps(bundle,indent=2)+'\n')
for local,remote in [(path,'bundle.json'),(T/'scripts/489-run-pointwise-pooling.py','run.py')]:subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(local),dest+'/'+remote],check=True)
command='sg docker -c '+shlex.quote('python3 '+base+'/run.py')+' > '+base+'/owner.log 2>&1'
subprocess.run(ssh+['tmux new-session -d -s kiln-pointwise-pooling-v2 '+shlex.quote(command)],check=True)
print('launched',base)
