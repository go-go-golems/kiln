#!/usr/bin/env python3
"""Archive primary operator contracts and independent installed-PyTorch probes."""
import hashlib,json,math,urllib.request
from pathlib import Path
import torch
p=Path(__file__).resolve().parents[1];out=p/'sources/singleton-view-semantics-v2';out.mkdir();records=[]
url='https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/torch/_torch_docs.py'
with urllib.request.urlopen(url,timeout=60) as response:content=response.read()
name='pytorch-2.9.1-torch-docs.py';(out/name).write_bytes(content);records.append({'url':url,'path':name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
for operation in ['unsqueeze','squeeze']:
 (out/(operation+'-installed-docstring.txt')).write_text(getattr(torch,operation).__doc__)
probes=[]
for shape in [[],[1],[2],[1,2,1],[2,1,3,1]]:
 value=torch.arange(math.prod(shape),dtype=torch.float32).reshape(shape);rank=len(shape)
 for operation in ['unsqueeze','squeeze']:
  dims=list(range(-rank-2,rank+2))+[True,None,[],[0,-max(1,rank)]]
  for dim in dims:
   row={'operation':operation,'shape':shape,'dim':dim}
   try:
    result=getattr(torch,operation)(value,dim=dim)
    row.update(output_shape=list(result.shape),values=result.flatten().tolist(),shares_storage=result.untyped_storage().data_ptr()==value.untyped_storage().data_ptr())
   except Exception as error:row.update(error_type=type(error).__name__,error=str(error))
   probes.append(row)
  if operation=='squeeze':
   result=value.squeeze();probes.append({'operation':operation,'shape':shape,'dim_omitted':True,'output_shape':list(result.shape),'values':result.flatten().tolist()})
state={'format':'kiln-singleton-source-semantics/1','torch_version':torch.__version__,'torch_revision':torch.version.git_version,'sources':records,'earlier_failure':{'url':'https://docs.pytorch.org/docs/2.9/generated/torch.unsqueeze.html','error':'urllib.error.HTTPError: HTTP Error 403: Forbidden','recovery':'Archive upstream tagged docstring source and installed operator docstrings; primary web pages inspected through web tool'},'schemas':{name:str(getattr(getattr(torch.ops.aten,name.split('.')[0]),name.split('.')[1])._schema) for name in ['unsqueeze.default','squeeze.default','squeeze.dim','squeeze.dims']},'probes':probes,'implementation_provenance':'Independent dimension binding over existing Kiln reshape; no upstream implementation copied'}
(out/'provenance-and-probes.json').write_text(json.dumps(state,indent=2)+'\n');print(json.dumps({'sources':len(records),'probes':len(probes),'torch_version':torch.__version__},indent=2))
