#!/usr/bin/env python3
"""KILN-007 Phase 0 probe 676 (GPU; run alone in the evaluator image with its default backend flags).

Where does PyTorch round in f16/bf16 scaled_dot_product_attention on this device? For family 5's shapes
(1x2x512x64 and 1x2x128x64; additive mask, bool mask, no mask) and each backend (default, flash, efficient,
math, cudnn) it records the error against five float64 references and which one is closest:

  p32         P kept in FP32 (Kiln's composed and fused numerics today)
  pq_l32      P rounded to the input dtype before P·V, l summed from unrounded p
  pq_lq       P rounded to the input dtype, l summed from the rounded p
  pq_exp2     as pq_l32, with the scale folded into exp2 (scores · scale · log2 e, then exp2)
  s_q         scores rounded to the input dtype before the softmax (math-backend style), P in FP32

It also runs a fully masked row (bool mask all false on row 3; additive mask -inf on row 3) and reports, per
backend, whether that row is NaN, zero, or something else: Kiln's reference produces NaN there.

usage: python 676-low-precision-attention-probe.py OUT.json
"""
import json, math, sys
import torch
import torch.nn.functional as F
from torch.nn.attention import sdpa_kernel, SDPBackend

# a CPU dry run (no GPU) exercises the references and the backends the CPU has; the real probe runs on cuda
DEV = 'cuda' if torch.cuda.is_available() else 'cpu'
BACKENDS = [('flash', SDPBackend.FLASH_ATTENTION), ('efficient', SDPBackend.EFFICIENT_ATTENTION),
            ('math', SDPBackend.MATH), ('cudnn', SDPBackend.CUDNN_ATTENTION)]


def references(q, k, v, mask, dtype):
    D = q.shape[-1]; scale = 1 / math.sqrt(D)
    q64, k64, v64 = q.double(), k.double(), v.double()
    raw = q64 @ k64.transpose(-2, -1)
    def masked(s):
        if mask is None: return s
        if mask.dtype == torch.bool: return s.masked_fill(~mask, float('-inf'))
        return s + mask.double()
    rnd = lambda t: t.to(dtype).double()
    s = masked(raw * scale)
    m = s.amax(-1, keepdim=True)
    e = torch.exp(s - m)
    out = {}
    out['p32'] = (e / e.sum(-1, keepdim=True)).float().double() @ v64
    out['pq_l32'] = rnd(e) @ v64 / e.sum(-1, keepdim=True)
    eq = rnd(e)
    out['pq_lq'] = eq @ v64 / eq.sum(-1, keepdim=True)
    s2 = s * math.log2(math.e)
    e2 = torch.exp2(s2 - s2.amax(-1, keepdim=True))
    out['pq_exp2'] = rnd(e2) @ v64 / e2.sum(-1, keepdim=True)
    sq = rnd(masked(rnd(raw) * scale))
    eq2 = torch.exp(sq - sq.amax(-1, keepdim=True))
    out['s_q'] = (eq2 / eq2.sum(-1, keepdim=True)).float().double() @ v64
    return out


def err(got, ref):
    d = (got.double() - ref).abs()
    d = d[~torch.isnan(d)]
    return {'max_abs': d.max().item() if d.numel() else None, 'mean_abs': d.mean().item() if d.numel() else None}


def run(fn):
    try: return fn()
    except Exception as e: return repr(e)[:200]


def case(dtype, L, mask_kind):
    torch.manual_seed(676)
    q, k, v = (torch.randn(1, 2, L, 64, device=DEV).to(dtype) for _ in range(3))
    mask = None
    if mask_kind == 'add': mask = torch.randn(1, 1, L, L, device=DEV).to(dtype)
    if mask_kind == 'bool':
        mask = torch.rand(1, 1, L, L, device=DEV) > 0.3; mask[..., 0] = True
    refs = references(q, k, v, mask, dtype)
    outs = {'default': run(lambda: F.scaled_dot_product_attention(q, k, v, attn_mask=mask))}
    for name, be in BACKENDS:
        def f(be=be):
            with sdpa_kernel(be): return F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
        outs[name] = run(f)
    row = {}
    for name, value in outs.items():
        if isinstance(value, str): row[name] = {'error': value}; continue
        e = {r: err(value, refs[r]) for r in refs}
        e['closest'] = min(e, key=lambda r: e[r]['max_abs'])
        if not isinstance(outs['default'], str): e['equals_default'] = bool(torch.equal(value, outs['default']))
        row[name] = e
    return row


def fully_masked(dtype):
    torch.manual_seed(677)
    q, k, v = (torch.randn(1, 2, 16, 64, device=DEV).to(dtype) for _ in range(3))
    keep = torch.ones(1, 1, 16, 16, dtype=torch.bool, device=DEV); keep[..., 3, :] = False
    add = torch.zeros(1, 1, 16, 16, device=DEV).to(dtype); add[..., 3, :] = float('-inf')
    out = {}
    for mname, mask in (('bool', keep), ('add', add)):
        for name, be in [('default', None), *BACKENDS]:
            def f(be=be):
                if be is None: return F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
                with sdpa_kernel(be): return F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
            r = run(f)
            if isinstance(r, str): out[f'{mname}/{name}'] = {'error': r}; continue
            row = r[..., 3, :].float()
            out[f'{mname}/{name}'] = {'nan': bool(torch.isnan(row).all()), 'zero': bool((row == 0).all()),
                                      'other_rows_finite': bool(torch.isfinite(torch.cat([r[..., :3, :], r[..., 4:, :]], -2)).all())}
    return out


result = {'torch': torch.__version__, 'device': torch.cuda.get_device_name() if DEV == 'cuda' else 'cpu (dry run)',
          'flags': {'matmul_allow_tf32': torch.backends.cuda.matmul.allow_tf32,
                    'allow_fp16_reduced_precision_reduction': torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction,
                    'allow_bf16_reduced_precision_reduction': torch.backends.cuda.matmul.allow_bf16_reduced_precision_reduction},
          'cases': {f'{str(d).split(".")[-1]}/L{L}/{m}': case(d, L, m) for d in (torch.float16, torch.bfloat16) for L in (128, 512) for m in ('add', 'bool', 'none')},
          'fully_masked': {str(d).split('.')[-1]: fully_masked(d) for d in (torch.float32, torch.float16, torch.bfloat16)}}
json.dump(result, open(sys.argv[1], 'w'), indent=1)
print(json.dumps(result, indent=1))
