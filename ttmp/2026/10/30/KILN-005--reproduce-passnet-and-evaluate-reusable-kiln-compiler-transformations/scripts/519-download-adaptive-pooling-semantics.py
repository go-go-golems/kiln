"""Retain public contract and pinned upstream implementation for semantic review."""
import hashlib,json,urllib.request
from pathlib import Path
out=Path(__file__).resolve().parent.parent/'sources/adaptive-pooling-semantics-v1';out.mkdir(exist_ok=True)
urls={
 'adaptive_avg_pool2d.html':'https://docs.pytorch.org/docs/main/generated/torch.nn.functional.adaptive_avg_pool2d.html',
 'AdaptiveAveragePooling.cpp':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/AdaptiveAveragePooling.cpp',
 'AdaptiveAveragePooling.cu':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/cuda/AdaptiveAveragePooling.cu',
 'AdaptivePooling.h':'https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/aten/src/ATen/native/AdaptivePooling.h'}
rows=[]
for name,url in urls.items():
 try:
  data=urllib.request.urlopen(url,timeout=40).read();(out/name).write_bytes(data)
  rows.append({'file':name,'url':url,'sha256':hashlib.sha256(data).hexdigest()})
 except Exception as e:rows.append({'file':name,'url':url,'error':str(e)})
(out/'manifest.json').write_text(json.dumps({'purpose':'Semantic reference; Kiln implementation is independent, no upstream code copied.','sources':rows},indent=2)+'\n')
