"""Stage frozen artifacts and launch one isolated GPU replay in tmux."""
import hashlib,json,shlex,subprocess,sys,tempfile
from pathlib import Path
repo=Path.cwd();T=Path(__file__).resolve().parent.parent;s=T/'sources';study=s/'pointwise-agent-development-v1';up=s/'upstream'
sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
for name,digest in state['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',revision+':'+name])).hexdigest()==digest,name
base='/home/manuel/passnet-kiln/KILN-005/sources/pointwise-agent-gpu-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];dest='manuel@bling:'+base;rsh='ssh -o HostKeyAlias=bling.local'
subprocess.run(ssh+['mkdir '+shlex.quote(base)],check=True)
with tempfile.NamedTemporaryFile(mode='w') as f:
 f.write('\n'.join(state['files'])+'\n');f.flush();subprocess.run(['rsync','-a','-e',rsh,'--files-from='+f.name,str(repo)+'/',dest+'/kiln/'],check=True)
manifest=json.loads((study/'corpus/manifest.json').read_text())
with tempfile.NamedTemporaryFile(mode='w') as f:
 f.write('\n'.join(['pass_bench/']+[r['graph']+'/' for r in manifest['variants']])+'\n');f.flush();subprocess.run(['rsync','-ar','-e',rsh,'--files-from='+f.name,'--exclude=__pycache__/','--exclude=*.pyc',str(up)+'/',dest+'/upstream/'],check=True)
subprocess.run(['rsync','-a','-e',rsh,str(study)+'/',dest+'/study/'],check=True)
proposals=s/'pointwise-agent-proposals-v1'
subprocess.run(['rsync','-a','-e',rsh,str(proposals)+'/',dest+'/proposals/'],check=True)
runner=T/'scripts/506-measure-pointwise-agents.py'
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(runner),dest+'/run.py'],check=True)
record={'source_revision':revision,'source_snapshot':state,'remote':base,'runner_sha256':hashlib.sha256(runner.read_bytes()).hexdigest(),'study_files_sha256':{str(p.relative_to(study)):hashlib.sha256(p.read_bytes()).hexdigest() for p in study.rglob('*') if p.is_file()}}
record['proposal_files_sha256']={str(p.relative_to(proposals)):hashlib.sha256(p.read_bytes()).hexdigest() for p in proposals.rglob('*') if p.is_file()}
(s/'pointwise-agent-gpu-staging-v1.json').write_text(json.dumps(record,indent=2)+'\n')
assert not subprocess.check_output(ssh+['nvidia-smi --query-compute-apps=pid --format=csv,noheader'],text=True).strip()
docker='docker run --rm --gpus all -v '+base+':/work --entrypoint python sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba /work/run.py'
command='sg docker -c '+shlex.quote(docker)+' > '+base+'/run.log 2>&1'
subprocess.run(ssh+['tmux new-session -d -s kiln-pointwise-agent-development-v1 '+shlex.quote(command)],check=True)
print(base,flush=True)
