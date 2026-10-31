#!/usr/bin/env python3
"""Archive primary GELU semantics and inspected implementation provenance."""
import hashlib,json,urllib.request
from pathlib import Path
import torch
p=Path(__file__).resolve().parents[1]/'sources';destination=p/'gelu-primary-sources-v1';destination.mkdir(exist_ok=True)
urls={'pytorch-gelu-2.9.html':'https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.gelu.html','pytorch-2.9.1-ActivationGeluKernel.cu':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/ActivationGeluKernel.cu','pytorch-2.9.1-LICENSE':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/LICENSE','cuda-single-precision-math.html':'https://docs.nvidia.com/cuda/cuda-math-api/cuda_math_api/group__CUDA__MATH__SINGLE.html'}
records=[]
failures=[]
for filename,url in urls.items():
    path=destination/filename
    if path.exists():raise ValueError('Preserve existing source: '+filename)
    try:
        with urllib.request.urlopen(url,timeout=45) as response:raw=response.read();resolved=response.url
    except Exception as error:
        failures.append({'file':filename,'url':url,'error':str(error)})
        continue
    path.write_bytes(raw);records.append({'file':filename,'url':url,'resolved_url':resolved,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
receipt={'scope':'Public API and implementation semantics inspected; independent Kiln implementation of mathematical formulas, no upstream kernel or library algorithm copied','torch':torch.__version__,'aten_schema':str(torch.ops.aten.gelu.default._schema),'functional_doc':torch.nn.functional.gelu.__doc__,'sources':records,'failures':failures,'earlier_failure':'First attempt stopped at the first URL: urllib.error.HTTPError: HTTP Error 403: Forbidden'}
(destination/'provenance.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'downloaded':{r['file']:r['bytes'] for r in records},'failures':failures},indent=2))
