#!/usr/bin/env python3
"""Which computation reproduces eager PyTorch's low-precision linear/conv output on this GPU?

usage: probe-reductions.py UPSTREAM GRAPH...   (inside the evaluator image; GRAPH relative to UPSTREAM)
For every linear / conv1d / conv3d call of the graph's source (evaluated on the evaluator's inputs), count
elements equal to the eager result for candidate computations:
  correct      float64 result rounded once to the dtype
  f32acc       float32 accumulation (cuBLAS/cuDNN with reduced-precision reduction disabled)
  rpr-off      the eager call with torch.backends.cuda.matmul.allow_{bf16,fp16}_reduced_precision_reduction = False
  splitK-c     K split in chunks of c: float32 partial sums rounded to the dtype, then summed in float32, rounded
  seq-dtype    sequential accumulation in the dtype (round after every multiply-add)
Diagnostic only.
"""
import argparse, sys, json
from pathlib import Path
up = Path(sys.argv[1]); sys.path.insert(0, str(up))
import torch, torch.nn.functional as F
from pass_bench.torch.test_compiler import get_input_dict

def r(x, dt): return x.to(dt)

def gemm_candidates(x, w, dt):
    """x [M, K], w [N, K] in dt; eager computes x @ w.T"""
    out = {}
    out['correct'] = r(x.double() @ w.double().T, dt)
    with torch.backends.cuda.matmul.__class__.__dict__.get('_dummy', None) or torch.no_grad():
        pass
    out['f32acc'] = r(x.float() @ w.float().T, dt) if not torch.backends.cuda.matmul.allow_tf32 else r((x.double() @ w.double().T).float(), dt)
    a, b = torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction, torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction
    torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction = False; torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction = False
    out['rpr-off'] = F.linear(x, w)
    torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction = a; torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction = b
    K = x.shape[1]
    for c in (2, 4, 8, 16, 32, 64):
        if K % c or c >= K: continue
        parts = [r(x[:, i:i + c].double() @ w[:, i:i + c].double().T, dt) for i in range(0, K, c)]
        out[f'splitK-{c}'] = r(sum(p.float() for p in parts), dt)
        acc = parts[0]
        for p in parts[1:]: acc = r(acc.float() + p.float(), dt)
        out[f'splitK-{c}-seq'] = acc
    acc = torch.zeros(x.shape[0], w.shape[0], dtype=dt, device=x.device)
    for k in range(K): acc = r(acc.float() + x[:, k:k + 1].float() * w[:, k].float(), dt)
    out['seq-dtype'] = acc
    return out

def report(name, eager, cands):
    row = {'call': name, 'dtype': str(eager.dtype), 'shape': list(eager.shape), 'elements': eager.numel()}
    row['equal_to_eager'] = {k: int((v.reshape(eager.shape) == eager).sum()) for k, v in cands.items()}
    print(json.dumps(row), flush=True); return row

rows = []
for graph in sys.argv[2:]:
    source = up / graph
    named = get_input_dict(argparse.Namespace(model_path=str(source), device='cuda'))
    text = (source / 'model.py').read_text()
    print('==', graph, flush=True)
    with torch.no_grad():
        if 'torch.nn.functional.linear(in_0, in_1, None)' in text:
            x, w = named['in_0'], named['in_1']
            rows.append(report('linear', F.linear(x, w), gemm_candidates(x, w, x.dtype)))
        if 'torch.conv3d(' in text:
            # patch conv: stride == kernel (2, 16, 16), no padding; as GEMM over patches
            ins = [named[k] for k in sorted(named, key=lambda s: int(s.split('_')[1]))]
            x = ins[-1]; w = ins[1]; b = ins[0]
            eager = torch.conv3d(x, w, b, (2, 16, 16))
            eager_nb = torch.conv3d(x, w, None, (2, 16, 16))
            N, C, T, H, W = x.shape; O = w.shape[0]
            p = x.reshape(N, C, T // 2, 2, H // 16, 16, W // 16, 16).permute(0, 2, 4, 6, 1, 3, 5, 7).reshape(-1, C * 2 * 16 * 16)
            cands = gemm_candidates(p, w.reshape(O, -1), x.dtype)
            def to_conv(v): return v.reshape(N, T // 2, H // 16, W // 16, O).permute(0, 4, 1, 2, 3)
            withbias = {k + '+bias(dtype)': r(to_conv(v).float() + b.float().reshape(1, -1, 1, 1, 1), x.dtype) for k, v in cands.items()}
            withbias['correct-fused-bias'] = r(to_conv(p.double() @ w.reshape(O, -1).double().T) + b.double().reshape(1, -1, 1, 1, 1), x.dtype)
            withbias['eager-nobias+bias(dtype)'] = r(eager_nb.float() + b.float().reshape(1, -1, 1, 1, 1), x.dtype)
            rows.append(report('conv3d (bias)', eager, withbias))
            rows.append(report('conv3d (no bias)', eager_nb, {k: to_conv(v) for k, v in cands.items()}))
        if 'torch.conv1d(' in text:
            x, w, b = named['in_3'], named['in_4'], named['in_2']
            eager = torch.conv1d(x, w, b, (2,), (15,), (1,), 16)
            eager_nb = torch.conv1d(x, w, None, (2,), (15,), (1,), 16)
            c = {'correct': r(torch.conv1d(x.double(), w.double(), None, (2,), (15,), (1,), 16), x.dtype)}
            rows.append(report('conv1d (no bias)', eager_nb, c))
            c2 = {'correct+bias(dtype)': r(c['correct'].float() + b.float().reshape(1, -1, 1), x.dtype),
                  'correct-fused-bias': r(torch.conv1d(x.double(), w.double(), b.double(), (2,), (15,), (1,), 16), x.dtype),
                  'eager-nobias+bias(dtype)': r(eager_nb.float() + b.float().reshape(1, -1, 1), x.dtype)}
            rows.append(report('conv1d (bias)', eager, c2))
