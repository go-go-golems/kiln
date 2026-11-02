#!/usr/bin/env python3
"""DNLNet (coverage family 40) at full size on CUDA: single-call numerics and the evaluator's call protocol.

usage: probe-dnlnet.py KILN UPSTREAM CORPUS [GRAPH_INDEX ...]   (inside the evaluator image)
The source graph divides its input in place (in_0 /= 256 ** 0.5; in_0 /= 0.05) and returns softmax(in_0).
pass_bench.torch.test_compiler.test_single_model builds one input_dict and calls the compiled model
warmup + trials + 1 times, then the eager model warmup + trials + 1 times, on the same tensors; the
compared outputs are the last call of each phase. This probe reports
  semantics: CUDA x /= torch.tensor(0.05) against x / float32(0.05) and x / dtype(0.05), per dtype;
  single:    one call each of Kiln and eager on clones of the same fresh inputs;
  protocol:  the evaluator's order on shared tensors (121 Kiln calls, then 121 eager calls);
  aligned:   121 eager calls on a fresh copy of the start inputs, against the protocol's Kiln output.
Each comparison: max |diff|, NaN counts, PassBench allclose at -5/-4/-3/1 (equal_nan as torch.allclose default).
"""
import argparse, json, sys
from pathlib import Path
kiln, up, corpus = map(Path, sys.argv[1:4]); pick = [int(i) for i in sys.argv[4:]]
sys.path[:0] = [str(kiln / 'runtime/python'), str(kiln / 'integrations/passnet'), str(up)]
import torch
from corpus import read_manifest, load_module, canonical_order_inputs
from dispatch import CorpusDispatch
from pass_bench.datatype_tolerance_config import get_precision
from pass_bench.torch.test_compiler import get_input_dict
CALLS = 20 + 100 + 1

def cmp(k, e):
    dt = str(e.dtype).removeprefix('torch.')
    row = {'nan_kiln': int(k.isnan().sum()), 'nan_eager': int(e.isnan().sum()), 'inf_kiln': int(k.isinf().sum()), 'inf_eager': int(e.isinf().sum()),
           'max_abs': float((k.double() - e.double()).abs().nan_to_num(0).max()), 'differ': int((k != e).sum())}
    for t in (-5, -4, -3, 1):
        rtol, atol = get_precision(t, dt); row[f'allclose_{t}'] = bool(torch.allclose(k, e, rtol=rtol, atol=atol))
    return row

out = {'format': 'kiln-dnlnet-probe/1', 'semantics': {}, 'records': []}
g = torch.Generator(device='cuda').manual_seed(0)
for dt in (torch.float32, torch.bfloat16, torch.float16):
    x = (torch.randn(1 << 20, device='cuda', generator=g) * 3).to(dt); y = x.clone(); y /= torch.tensor(0.05, device='cuda')
    out['semantics'][str(dt)] = {'f32_divisor': int((y == (x.float() / 0.05).to(dt)).sum()), 'dtype_divisor': int((y == (x.float() / torch.tensor(0.05).to(dt).float()).to(dt)).sum()), 'elements': x.numel()}
print(json.dumps(out['semantics']), flush=True)
manifest = read_manifest(corpus); dispatch = CorpusDispatch(corpus, include_paths=['/usr/local/cuda/include'])
for index, record in enumerate(manifest['variants']):
    if pick and index not in pick: continue
    source = up / record['graph']
    model = load_module(source / 'model.py').GraphModule().cuda().eval()
    named = get_input_dict(argparse.Namespace(model_path=str(source), device='cuda'))
    start = named['in_0']; spec = tuple(record['specialization'])
    def kiln_call(x): return dispatch(*canonical_order_inputs(record, [x]), specialization=spec)
    def eager_call(x): return model(x)[0]
    with torch.no_grad():
        a, b = start.clone(), start.clone()
        single = cmp(kiln_call(a), eager_call(b)); single['mutated_input'] = cmp(a, b)
        shared = start.clone(); fresh = start.clone()
        for _ in range(CALLS): k = kiln_call(shared)
        k = k.clone()
        for _ in range(CALLS): e = eager_call(shared)
        for _ in range(CALLS): ea = eager_call(fresh)
        rec = {'graph': record['graph'], 'shape': list(start.shape), 'dtype': str(start.dtype), 'single': single,
               'protocol': cmp(k, e), 'aligned': cmp(k, ea), 'input_absmax_start': float(start.float().abs().max()),
               'input_absmax_after_kiln_phase': float(fresh.float().abs().max())}
        del shared, fresh, a, b, k, e, ea
    torch.cuda.empty_cache()
    out['records'].append(rec); print(json.dumps(rec), flush=True)
dispatch.close()
