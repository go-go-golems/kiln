#!/usr/bin/env python3
"""Try to capture family 162's target graph with TorchDynamo on meta tensors (as script 658 does) on a CPU-only host.
usage: 02-dynamo-capture-162.py GRAPH_DIRECTORY [--meta-device]
--meta-device rewrites device(type='cuda', index=0) to device(type='meta') in the source before loading (simulation only:
the captured graph then has a meta .to(), not the CUDA one PassBench sees)."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(ROOT / 'integrations/passnet'))
import torch
from corpus import load_module
d = Path(sys.argv[1])
if '--meta-device' in sys.argv[2:]:
    import tempfile, shutil
    tmp = Path(tempfile.mkdtemp()); [shutil.copy(d / f, tmp / f) for f in ('model.py', 'input_meta.py', 'weight_meta.py')]
    (tmp / 'model.py').write_text((d / 'model.py').read_text().replace("device(type='cuda', index=0)", "device(type='meta')")); d = tmp
model = load_module(d / 'model.py').GraphModule()
meta = []
for f in ('input_meta.py', 'weight_meta.py'):
    m = load_module(d / f); meta.extend(c for c in vars(m).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
meta.sort(key=lambda c: int(c.name.split('_')[-1]))
inputs = [torch.empty(c.shape, dtype=getattr(torch, c.dtype.split('.')[-1]), device='meta') for c in meta]
graphs = []
def capture(gm, example): graphs.append(gm); return gm.forward
try:
    torch.compile(model, backend=capture, dynamic=False, fullgraph=True)(*inputs)
    for n in graphs[0].graph.nodes: print(n.format_node())
except Exception as e:
    print('capture failed:', type(e).__name__, str(e).splitlines()[0][:300])
