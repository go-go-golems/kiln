"""Collect terminal GPU correctness evidence for compiled pooling fixtures."""
import json,subprocess
from pathlib import Path
T=Path(__file__).resolve().parent.parent
out=T/'sources/avg-pooling-cuda-results-v1';out.mkdir()
remote='/home/manuel/passnet-kiln/KILN-005/sources/avg-pooling-cuda-v1'
for local,name in [('run.json','run.json'),('results.json','output/results.json'),('execution.log','execution.log')]:
 subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+remote+'/'+name,str(out/local)],check=True)
run=json.loads((out/'run.json').read_text());data=json.loads((out/'results.json').read_text())
assert run['status']=='complete' and len(data['records'])==312
assert all(r['status']=='passed' for r in data['records'])
summary={'programs':len(data['records']),'by_dtype':{d:sum(r['dtype']==d for r in data['records']) for d in ['f32','f16','bf16']},'max_abs_error':max(r['max_abs_error'] for r in data['records']),'scope':'Oracle pooling fixtures; not PassBench task acceptance.'}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
