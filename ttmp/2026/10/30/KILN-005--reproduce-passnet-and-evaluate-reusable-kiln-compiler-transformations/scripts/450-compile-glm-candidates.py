"""Compile actual GLM policies and compare executables on development training graphs."""
import json
from pathlib import Path
import subprocess
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
out=ticket/'sources/pi-policy-compile-v1';out.mkdir()
corpus=ticket/'sources/native-policy-search-v2/corpus'
baseline=json.loads((ticket/'sources/native-policy-search-v2/controls/default/compile-receipt.json').read_text())
bygraph={r['graph']:r for r in baseline['records']}
results=[]
for artifact in sorted((ticket/'sources/pi-policy-batch-v1/run/task').glob('*.artifact.json')):
 name=artifact.name.split('.')[0]
 policy=json.loads(artifact.read_text())['program'];policy['id']=name
 path=out/(name+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
 command=['/home/manuel/.nvm/versions/node/v26.13.0/bin/node',str(root/'integrations/passnet/compile_policy.mjs'),
 '--directory',str(corpus),'--output',str(out/name),'--policy',str(path),'--target','a100','--phase','train']
 with (out/(name+'.log')).open('w') as log:
  run=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 receipt=json.loads((out/name/'compile-receipt.json').read_text())
 rows=[]
 for row in receipt['records']:
  rows.append({'graph':row['graph'],'status':row['status'],
   'changed':row.get('fingerprint')!=bygraph[row['graph']].get('fingerprint'),
   'kernels':row.get('kernel_count'),'baseline_kernels':bygraph[row['graph']].get('kernel_count')})
 results.append({'candidate':name,'policy':policy,'returncode':run.returncode,'records':rows})
 (out/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
 print(name,'compiled',sum(r['status']=='compiled' for r in rows),'changed',sum(r['changed'] for r in rows),flush=True)
