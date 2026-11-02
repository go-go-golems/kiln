#!/usr/bin/env python3
"""Archive primary references used for independent activation import lowering."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.error import HTTPError
root=Path(__file__).resolve().parents[1]/'sources/pytorch/activations';root.mkdir(parents=True,exist_ok=True)
urls={
 'OpMathType-v2.9.1.h':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/OpMathType.h',
 'LICENSE-v2.9.1.txt':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/LICENSE',
 'silu-2.9.html':'https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.silu.html',
 'sigmoid-2.9.html':'https://docs.pytorch.org/docs/2.9/generated/torch.sigmoid.html',
 'ActivationSiluKernel-v2.9.1.cu':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/ActivationSiluKernel.cu',
 'UnarySpecialOpsKernel-v2.9.1.cu':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/UnarySpecialOpsKernel.cu'}
records=[]
for name,url in urls.items():
 try:
  data=urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0 (research archive)'})).read();(root/name).write_bytes(data)
  records.append({'file':name,'url':url,'status':'downloaded','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 except HTTPError as error:
  records.append({'file':name,'url':url,'status':'failed','error':str(error)})
(root/'provenance.json').write_text(json.dumps({'purpose':'Independent semantic mapping to existing Kiln operators; no PyTorch implementation copied','records':records},indent=2)+'\n')
print('Archived',sum(r['status']=='downloaded' for r in records),'of',len(records),'primary references; failures preserved in provenance.json')
if any(r['status']!='downloaded' for r in records if r['file'].endswith('.cu')):raise SystemExit('Primary CUDA source acquisition incomplete')
