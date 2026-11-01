#!/usr/bin/env python3
"""Two GPU probes for the cost model and the TF32 boundary (run alone on the GPU, in the evaluator image).

1. TF32 operand rounding: compute FP32 linear and conv2d with allow_tf32 on, and compare each against
   float64 references computed from operands rounded to TF32 three ways: round-to-nearest-away (Kiln's
   cvt.rna), round-to-nearest-even, and truncation, plus unrounded FP32 operands. The closest emulation
   names what the backend does.
2. L2 and DRAM read bandwidth: a Triton kernel that streams a buffer many times; buffers below the L2
   size measure L2 bandwidth, a large buffer measures DRAM.

usage: python 671-gpu-numerics-and-bandwidth-probes.py OUT.json
"""
import json, sys, time
import torch
import torch.nn.functional as F


def tf32(x, mode):
    b = x.contiguous().view(torch.int32)
    if mode == 'rz':
        r = b & ~0x1FFF
    elif mode == 'rna':
        r = (b + 0x1000) & ~0x1FFF
    elif mode == 'rne':
        r = (b + 0xFFF + ((b >> 13) & 1)) & ~0x1FFF
    else:
        return x
    return r.view(torch.float32)


def rounding_probe():
    g = torch.Generator(device='cuda').manual_seed(0)
    cases = {
        'linear': (lambda a, w: F.linear(a, w), (torch.randn(256, 1024, generator=g, device='cuda'), torch.randn(512, 1024, generator=g, device='cuda'))),
        'conv1x1': (lambda a, w: F.conv2d(a, w), (torch.randn(8, 256, 28, 28, generator=g, device='cuda'), torch.randn(128, 256, 1, 1, generator=g, device='cuda'))),
        'conv3x3': (lambda a, w: F.conv2d(a, w, padding=1), (torch.randn(8, 64, 28, 28, generator=g, device='cuda'), torch.randn(64, 64, 3, 3, generator=g, device='cuda'))),
        'conv3x3_wide': (lambda a, w: F.conv2d(a, w, padding=1), (torch.randn(4, 256, 14, 14, generator=g, device='cuda'), torch.randn(256, 256, 3, 3, generator=g, device='cuda'))),
    }
    out = {}
    for name, (fn, (a, w)) in cases.items():
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        got = fn(a, w).double()
        row = {}
        for mode in ('fp32', 'rna', 'rne', 'rz'):
            ref = fn(tf32(a, mode).double(), tf32(w, mode).double())
            d = (got - ref).abs()
            row[mode] = {'max_abs': d.max().item(), 'mean_abs': d.mean().item()}
        row['closest'] = min(('fp32', 'rna', 'rne', 'rz'), key=lambda m: row[m]['mean_abs'])
        out[name] = row
    torch.backends.cuda.matmul.allow_tf32 = torch.backends.cudnn.allow_tf32 = True
    return out


def bandwidth_probe():
    import triton
    import triton.language as tl

    @triton.jit
    def stream(x, out, n, reps, BLOCK: tl.constexpr):
        pid = tl.program_id(0)
        nprog = tl.num_programs(0)
        acc = tl.zeros([BLOCK], dtype=tl.float32)
        for r in range(reps):
            for start in range(pid * BLOCK, n, nprog * BLOCK):
                offs = start + tl.arange(0, BLOCK)
                acc += tl.load(x + offs, mask=offs < n, other=0.0)
        tl.store(out + pid * BLOCK + tl.arange(0, BLOCK), acc)

    props = torch.cuda.get_device_properties(0)
    sms, BLOCK = props.multi_processor_count, 1024
    rows = []
    for mb in (1, 2, 4, 8, 12, 16, 32, 64, 256, 1024):
        n = mb * 1024 * 1024 // 4
        x = torch.ones(n, device='cuda')
        programs = sms * 8
        out = torch.empty(programs * BLOCK, device='cuda')
        reps = max(1, (4 * 1024) // mb)
        stream[(programs,)](x, out, n, reps, BLOCK=BLOCK)
        torch.cuda.synchronize()
        times = []
        for _ in range(5):
            start, end = torch.cuda.Event(enable_timing=True), torch.cuda.Event(enable_timing=True)
            start.record(); stream[(programs,)](x, out, n, reps, BLOCK=BLOCK); end.record()
            torch.cuda.synchronize(); times.append(start.elapsed_time(end) / 1000)
        t = sorted(times)[len(times) // 2]
        rows.append({'buffer_mb': mb, 'reps': reps, 'seconds': t, 'gb_per_s': n * 4 * reps / t / 1e9})
    return {'device': props.name, 'sms': sms, 'l2_bytes': getattr(props, 'L2_cache_size', None), 'rows': rows}


if __name__ == '__main__':
    assert torch.cuda.is_available()
    result = {'format': 'kiln-gpu-probes/1', 'torch': torch.__version__, 'cudnn': torch.backends.cudnn.version(),
              'rounding': rounding_probe(), 'bandwidth': bandwidth_probe(), 'time': time.time()}
    open(sys.argv[1], 'w').write(json.dumps(result, indent=1) + '\n')
    print(json.dumps(result, indent=1))
