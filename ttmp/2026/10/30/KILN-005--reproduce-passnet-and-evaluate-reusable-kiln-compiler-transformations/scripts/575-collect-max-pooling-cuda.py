"""Collect terminal max-pool fixture evidence and audit individual CUDA results."""
import collections,json,subprocess
from pathlib import Path
T=Path(__file__).resolve().parent.parent;out=T/'sources/max-pooling-cuda-results-v1';out.mkdir()
remote='manuel@bling:/home/manuel/passnet-kiln/KILN-005/sources/max-pooling-cuda-v1/'
subprocess.run(['rsync','-a','-e','ssh -o HostKeyAlias=bling.local','--include','run.json','--include','execution.log','--include','output/','--include','output/results.json','--exclude','*',remote,str(out)+'/'],check=True)
run=json.loads((out/'run.json').read_text());assert run['status']=='complete' and run['returncode']==0
result=json.loads((out/'output/results.json').read_text());rows=result['records'];assert len(rows)==78
counts=dict(collections.Counter(r['status'] for r in rows));summary={'format':'kiln-max-pooling-cuda-audit/1','scope':'78 fixed native PyTorch CUDA fixture comparisons, not PassBench task acceptance','count':len(rows),'counts':counts,'gpu':result['gpu'],'torch_version':result['torch_version'],'source_sha256':result['source_sha256']}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2));assert counts=={'passed':78}
