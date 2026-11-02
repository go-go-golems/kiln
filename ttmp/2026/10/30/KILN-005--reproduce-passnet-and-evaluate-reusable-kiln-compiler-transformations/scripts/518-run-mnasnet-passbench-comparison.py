"""Run a diagnostic in the completed confirmation environment, preserving results."""
import shlex,subprocess
from pathlib import Path
T=Path(__file__).resolve().parent.parent;base='/home/manuel/passnet-kiln/KILN-005/sources/pointwise-agent-confirmation-gpu-v1'
ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
subprocess.run(ssh+['test ! -e '+base+'/passbench-numerical.json'],check=True)
subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local',str(T/'scripts/517-compare-mnasnet-passbench.py'),'manuel@bling:'+base+'/compare.py'],check=True)
docker='docker run --rm --gpus all -v '+base+':/work --entrypoint python sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba /work/compare.py'
subprocess.run(ssh+['sg docker -c '+shlex.quote(docker)+' > '+base+'/passbench-comparison-owner.log 2>&1'],check=True)
for name in ['passbench-numerical.json','passbench-numerical.log']:
 subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+base+'/'+name,str(T/'sources/pointwise-agent-confirmation-gpu-results-v1'/name)],check=True)
