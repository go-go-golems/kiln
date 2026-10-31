#!/usr/bin/env python3
"""Archive official public semantics and local API reference, with provenance."""
import hashlib,inspect,json,urllib.request
from pathlib import Path
import torch
import torch.nn.functional as f
p=Path(__file__).resolve().parents[1]/'sources'
url='https://raw.githubusercontent.com/pytorch/pytorch/v2.9.1/torch/nn/functional.py'
content=urllib.request.urlopen(url,timeout=60).read()
(p/'pytorch-v2.9.1-functional.py').write_bytes(content)
local=('Installed PyTorch '+torch.__version__+'; semantic reference only; no implementation copied.\n\n'+inspect.getsource(f._get_softmax_dim)+'\n'+inspect.getsource(f.softmax)).encode()
(p/'pytorch-softmax-local-reference.txt').write_bytes(local)
receipt={'url':url,'source_sha256':hashlib.sha256(content).hexdigest(),'local_reference_sha256':hashlib.sha256(local).hexdigest(),'torch':torch.__version__,'schemas':[str(torch.ops.aten._softmax.default._schema),str(torch.ops.aten.softmax.int._schema)],'reuse':'Semantic contract and existing Kiln N.softmax; no PyTorch implementation ported'}
(p/'softmax-reference-provenance.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
