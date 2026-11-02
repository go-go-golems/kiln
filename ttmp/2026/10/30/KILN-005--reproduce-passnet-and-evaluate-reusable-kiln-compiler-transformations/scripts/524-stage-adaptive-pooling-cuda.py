"""Stage compiled pooling fixtures and existing runtime for the authorized DGX."""
import hashlib,json,shlex,subprocess,tarfile
from pathlib import Path
T=Path(__file__).resolve().parent.parent;root=Path.cwd()
out=T/'sources/adaptive-pooling-cuda-staging-v1';out.mkdir()
fixtures=T/'sources/adaptive-pooling-cuda-fixtures-v1'
assert (fixtures/'manifest.json').exists()
files={'fixtures/'+p.name:p for p in fixtures.glob('*.json')}
files.update({'runtime.py':root/'integrations/passnet/runtime.py','kiln_launch.py':root/'runtime/python/kiln_launch.py',
 'check_pooling_cuda.py':T/'scripts/523-check-adaptive-pooling-cuda.py','run.py':T/'scripts/525-run-adaptive-pooling-cuda.py'})
manifest={'files_sha256':{name:hashlib.sha256(p.read_bytes()).hexdigest() for name,p in files.items()}}
(out/'bundle.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=out/'bundle.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for name,p in files.items():tar.add(p,arcname=name)
remote='/home/manuel/passnet-kiln/KILN-005/sources/adaptive-pooling-cuda-v1'
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['mkdir '+shlex.quote(remote)],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(archive),'manuel@bling:'+remote+'/bundle.tar.gz'],check=True)
subprocess.run(ssh+['tar -xzf '+remote+'/bundle.tar.gz -C '+remote],check=True)
command='sg docker -c '+shlex.quote('python3 '+remote+'/run.py')
subprocess.run(ssh+['tmux new-session -d -s kiln-adaptive-pooling-cuda-v1 '+shlex.quote(command)],check=True)
(out/'launch.json').write_text(json.dumps({'remote':remote,'session':'kiln-adaptive-pooling-cuda-v1','status':'launched'},indent=2)+'\n')
print('launched',remote)
