#!/usr/bin/env python3
"""Archive primary layer-normalization semantics; the importer is independently written."""
import hashlib,json,urllib.request,urllib.error
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/pytorch/layer-norm';p.mkdir(parents=True,exist_ok=True)
items=[('functional-layer-norm-2.9.html','https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.layer_norm.html'),
 ('layer-norm-2.9.html','https://docs.pytorch.org/docs/2.9/generated/torch.nn.LayerNorm.html'),
 ('layer_norm-v2.9.1.cpp','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/layer_norm.cpp'),
 ('layer_norm_kernel-v2.9.1.cu','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/layer_norm_kernel.cu'),
 ('functional-v2.9.1.py','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/torch/nn/functional.py'),
 ('normalization-v2.9.1.py','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/torch/nn/modules/normalization.py'),
 ('LICENSE','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/LICENSE')]
prior=json.loads((p/'provenance.json').read_text()) if (p/'provenance.json').exists() else {}
rows=prior.get('sources',[]);failures=prior.get('retrieval_failures',[])
for name,url in items:
 if (p/name).exists():
  row=next(r for r in rows if r['file']==name)
  assert row['url']==url and row['sha256']==hashlib.sha256((p/name).read_bytes()).hexdigest()
  continue
 try:data=urllib.request.urlopen(url,timeout=60).read()
 except urllib.error.HTTPError as error:
  failures.append({'url':url,'error':str(error)});print('UNAVAILABLE',url,str(error),flush=True)
  (p/'retrieval-failures.json').write_text(json.dumps(failures,indent=2)+'\n');continue
 (p/name).write_bytes(data)
 rows.append({'file':name,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 (p/'provenance.json').write_text(json.dumps({'scope':'Independent source binding to existing Kiln layer_norm after flattening normalized dimensions; no native normalization code ported','sources':rows,'retrieval_failures':failures},indent=2)+'\n')
 print(name,len(data))

assert all((p/name).is_file() for name in ['layer_norm-v2.9.1.cpp','layer_norm_kernel-v2.9.1.cu','functional-v2.9.1.py','normalization-v2.9.1.py','LICENSE'])
