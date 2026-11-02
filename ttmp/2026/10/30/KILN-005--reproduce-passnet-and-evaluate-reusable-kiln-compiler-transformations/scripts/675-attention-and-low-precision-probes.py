#!/usr/bin/env python3
"""GPU probes deciding three Kiln numerics questions (run alone on the GPU, in the evaluator image,
with the evaluator's default backend flags).

1. f32 scaled_dot_product_attention (task 5's shape: 1x2x512x64, additive mask): which SDPA backend
   runs, and whether its products round operands to TF32. The output is compared with float64
   references whose two products use FP32 operands or RNE-TF32 operands.
2. Low-precision products (families 17 and 147): f16/bf16 linear (1000x128 @ 128x128) and 1x1 conv
   (128x256x16x16 -> 1024): the fraction of output elements differing from "f32 accumulation, one
   rounding" (float64 accumulation then rounding), with the reduced-precision-reduction flags at
   their defaults and forced off.
3. f32 1x1 convolution at task 119's shape (16x512x64x64 -> 21): closest of FP32/RNE/RNA operands.

usage: python 675-attention-and-low-precision-probes.py OUT.json
"""
import json, sys
import torch
import torch.nn.functional as F


def tf32(x, mode):
    b = x.contiguous().view(torch.int32)
    r = (b + 0xFFF + ((b >> 13) & 1)) & ~0x1FFF if mode == 'rne' else (b + 0x1000) & ~0x1FFF
    return r.view(torch.float32)


def err(got, ref):
    d = (got.double() - ref).abs()
    return {'max_abs': d.max().item(), 'mean_abs': d.mean().item()}


def attention():
    torch.manual_seed(0)
    q, k, v = (torch.randn(1, 2, 512, 64, device='cuda') for _ in range(3))
    mask = torch.randn(1, 1, 512, 512, device='cuda')
    backends = {}
    from torch.nn.attention import sdpa_kernel, SDPBackend
    for name, be in [('flash', SDPBackend.FLASH_ATTENTION), ('efficient', SDPBackend.EFFICIENT_ATTENTION), ('math', SDPBackend.MATH), ('cudnn', SDPBackend.CUDNN_ATTENTION)]:
        try:
            with sdpa_kernel(be): backends[name] = F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
        except Exception as e: backends[name] = repr(e)[:160]
    default = F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
    def reference(mode):
        # rne: both products see TF32 operands; the probabilities round to f32 before the second
        r = (lambda t: tf32(t, 'rne')) if mode == 'rne' else (lambda t: t)
        s = (r(q).double() @ r(k).double().transpose(-2, -1)) * 0.125 + mask.double()
        p = torch.softmax(s, -1).to(torch.float32)
        return r(p).double() @ r(v).double()
    refs = {m: reference(m) for m in ('fp32', 'rne')}
    out = {'flags': {'matmul_allow_tf32': torch.backends.cuda.matmul.allow_tf32, 'cudnn_allow_tf32': torch.backends.cudnn.allow_tf32,
                     'float32_matmul_precision': torch.get_float32_matmul_precision()}}
    for name, value in [('default', default), *backends.items()]:
        if isinstance(value, str): out[name] = {'error': value}; continue
        e = {m: err(value, refs[m]) for m in refs}
        e['closest'] = min(e, key=lambda m: e[m]['max_abs'])
        e['equals_default'] = bool(torch.equal(value, default))
        out[name] = e
    return out


def flips(got, ref64, dtype):
    want = ref64.to(dtype)
    return {'differ_fraction': (got != want).float().mean().item(), 'max_abs': (got.float() - want.float()).abs().max().item()}


def low_precision():
    torch.manual_seed(1)
    out = {}
    for dtype, flag in [(torch.float16, 'allow_fp16_reduced_precision_reduction'), (torch.bfloat16, 'allow_bf16_reduced_precision_reduction')]:
        x, w, b = torch.randn(1000, 128, device='cuda').to(dtype), torch.randn(128, 128, device='cuda').to(dtype) / 11, torch.randn(128, device='cuda').to(dtype)
        ref = x.double() @ w.double().t() + b.double()
        xc, wc = torch.randn(128, 256, 16, 16, device='cuda').to(dtype), (torch.randn(1024, 256, 1, 1, device='cuda') / 16).to(dtype)
        refc = F.conv2d(xc.double(), wc.double())
        row = {'default_flag': getattr(torch.backends.cuda.matmul, flag)}
        for setting in (True, False):
            setattr(torch.backends.cuda.matmul, flag, setting)
            row[f'linear_{setting}'] = flips(F.linear(x, w, b), ref, dtype)
            row[f'conv1x1_{setting}'] = flips(F.conv2d(xc, wc), refc, dtype)
        setattr(torch.backends.cuda.matmul, flag, row['default_flag'])
        out[str(dtype)] = row
    return out


def conv1x1_f32():
    torch.manual_seed(2)
    x, w, b = torch.randn(16, 512, 64, 64, device='cuda'), torch.randn(21, 512, 1, 1, device='cuda') / 22, torch.randn(21, device='cuda')
    got = F.conv2d(x, w, b)
    res = {}
    for mode in ('fp32', 'rne', 'rna'):
        r = (lambda t: t) if mode == 'fp32' else (lambda t, m=mode: tf32(t, m))
        res[mode] = err(got, F.conv2d(r(x).double(), r(w).double(), b.double()))
    res['closest'] = min(('fp32', 'rne', 'rna'), key=lambda m: res[m]['max_abs'])
    return res


result = {'format': 'kiln-gpu-probes/2', 'torch': torch.__version__, 'device': torch.cuda.get_device_name(),
          'attention_f32': attention(), 'low_precision_products': low_precision(), 'conv1x1_f32_task119': conv1x1_f32()}
json.dump(result, open(sys.argv[1], 'w'), indent=1)
print(json.dumps(result, indent=1))
