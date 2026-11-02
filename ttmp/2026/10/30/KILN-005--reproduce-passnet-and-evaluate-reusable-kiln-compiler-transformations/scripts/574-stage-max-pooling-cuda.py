"""Stage exact max-pool artifacts and launch a single pinned remote CUDA fixture job."""
import hashlib,json,shlex,subprocess,tarfile
from pathlib import Path
T=Path(__file__).resolve().parent.parent;root=Path.cwd();out=T/'sources/max-pooling-cuda-staging-v1';out.mkdir()
fixtures=T/'sources/max-pooling-cuda-fixtures-v1';assert (fixtures/'manifest.json').exists()
files={'fixtures/'+p.name:p for p in fixtures.glob('*.json')}
files.update({'runtime.py':root/'integrations/passnet/runtime.py','kiln_launch.py':root/'runtime/python/kiln_launch.py','check.py':T/'scripts/572-check-max-pooling-cuda.py','run.py':T/'scripts/573-run-max-pooling-cuda.py'})
(out/'bundle.json').write_text(json.dumps({'files_sha256':{name:hashlib.sha256(p.read_bytes()).hexdigest() for name,p in files.items()}},indent=2)+'\n')
archive=out/'bundle.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for name,p in files.items():tar.add(p,arcname=name)
remote='/home/manuel/passnet-kiln/KILN-005/sources/max-pooling-cuda-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['mkdir '+shlex.quote(remote)],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(archive),'manuel@bling:'+remote+'/bundle.tar.gz'],check=True)
subprocess.run(ssh+['tar -xzf '+remote+'/bundle.tar.gz -C '+remote],check=True)
command='sg docker -c '+shlex.quote('python3 '+remote+'/run.py')
subprocess.run(ssh+['tmux new-session -d -s kiln-max-pooling-cuda-v1 '+shlex.quote(command)],check=True)
(out/'launch.json').write_text(json.dumps({'remote':remote,'session':'kiln-max-pooling-cuda-v1','status':'launched'},indent=2)+'\n')
print('launched',remote)
