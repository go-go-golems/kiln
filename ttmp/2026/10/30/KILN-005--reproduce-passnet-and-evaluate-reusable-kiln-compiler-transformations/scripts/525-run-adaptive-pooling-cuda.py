"""Run the preserved pooling fixture checker in the established CUDA image."""
import json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent
receipt=root/'run.json'
assert not receipt.exists()
result={'status':'running'}
try:
 activity=subprocess.check_output(['nvidia-smi','--query-compute-apps=pid','--format=csv,noheader'],text=True).strip()
 assert not activity,'GPU compute activity present'
 (root/'output').mkdir()
 command=['docker','run','--rm','--name','kiln005-adaptive-pooling-fixtures-v1','--gpus','all',
  '-v',str(root)+':/work:ro','-v',str(root/'output')+':/results','-w','/work',
  '-e','PYTHONPATH=/work','--entrypoint','python',
  'sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba',
  '/work/check_pooling_cuda.py','--fixtures','/work/fixtures','--output','/results/results.json']
 result['command']=command;receipt.write_text(json.dumps(result,indent=2)+'\n')
 with (root/'execution.log').open('w') as log:p=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 result.update(status='complete' if p.returncode==0 else 'failed',returncode=p.returncode)
except Exception as e:result.update(status='failed',error=str(e))
receipt.write_text(json.dumps(result,indent=2)+'\n')
