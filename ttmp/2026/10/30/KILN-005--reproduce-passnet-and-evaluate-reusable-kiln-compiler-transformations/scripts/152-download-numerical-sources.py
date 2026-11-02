#!/usr/bin/env python3
"""Archive primary numerical-contract documentation and source with provenance."""
import hashlib,json,urllib.request
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources/numerics';p.mkdir(exist_ok=False)
items=[('cuda-single-intrinsics-13.1.1.html','https://docs.nvidia.com/cuda/archive/13.1.1/cuda-math-api/cuda_math_api/group__CUDA__MATH__INTRINSIC__SINGLE.html'),
 ('nvrtc-13.1.1.html','https://docs.nvidia.com/cuda/archive/13.1.1/nvrtc/index.html'),
 ('pytorch-Normalization-v2.9.1.cuh','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/Normalization.cuh'),
 ('pytorch-Normalization-v2.9.1.cu','https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/Normalization.cu')]
rows=[]
for name,url in items:
 data=urllib.request.urlopen(url,timeout=60).read();(p/name).write_bytes(data)
 rows.append({'file':name,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 (p/'provenance.json').write_text(json.dumps({'scope':'Primary reference only; independent Kiln implementation; no native CUDA normalization code ported','sources':rows},indent=2)+'\n')
 print(name,len(data))
