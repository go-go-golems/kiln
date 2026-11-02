#!/usr/bin/env python3
"""Archive primary PyTorch matrix semantics; no upstream code is ported."""
import hashlib,json
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root=Path(__file__).resolve().parents[1]/'sources/pytorch/linalg';root.mkdir(parents=True,exist_ok=True)
urls={**{name+'-2.9.html':'https://docs.pytorch.org/docs/2.9/generated/'+target+'.html' for name,target in [('matmul','torch.matmul'),('linear','torch.nn.functional.linear'),('mm','torch.mm'),('bmm','torch.bmm')]},
 'symbolic_trace-v2.9.1.py':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/torch/fx/_symbolic_trace.py',
 'Linear-v2.9.1.cpp':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/Linear.cpp',
 'LinearAlgebra-v2.9.1.cpp':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/LinearAlgebra.cpp',
 'CUDABlas-v2.9.1.cpp':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/cuda/CUDABlas.cpp',
 'LICENSE-v2.9.1.txt':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/LICENSE'}
records=[]
for name,url in urls.items():
 try:
  data=urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0 (research archive)'})).read();(root/name).write_bytes(data)
  records.append({'file':name,'url':url,'status':'downloaded','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 except HTTPError as error:records.append({'file':name,'url':url,'status':'failed','error':str(error)})
(root/'provenance.json').write_text(json.dumps({'purpose':'Independent semantics/shape lowering; existing Kiln matrix decomposition replaced without copying PyTorch implementation','records':records},indent=2)+'\n')
print('Archived',sum(r['status']=='downloaded' for r in records),'of',len(records),'matrix references')
if any(r['status']!='downloaded' for r in records):raise SystemExit('Incomplete primary references; inspect provenance')
