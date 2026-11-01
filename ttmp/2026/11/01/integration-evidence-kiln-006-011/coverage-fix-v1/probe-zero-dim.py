#!/usr/bin/env python3
"""How PyTorch (CPU vs CUDA) uses a 0-d float32 tensor operand of an op with a low-precision tensor.

For x (bf16/f16, dimensioned) and s (0-d float32: a Python number, a CPU tensor, a CUDA tensor),
count elements of op(x, s) equal to (a) op(x.float(), float32(s)).to(dtype) and (b)
op(x.float(), float32(dtype(s))).to(dtype), for add/sub/mul/div, reversed operands and in-place forms.
"""
import json, torch
rows = []
g = torch.Generator().manual_seed(0)
for device in ('cpu', 'cuda'):
    for dt in (torch.bfloat16, torch.float16):
        x = (torch.randn(1 << 18, generator=g) * 3).to(dt).to(device)
        for value in (0.05, 0.3, 1.7):
            for kind in ('python', 'cpu0d', 'cuda0d'):
                s = value if kind == 'python' else torch.tensor(value, device='cpu' if kind == 'cpu0d' else 'cuda')
                if device == 'cpu' and kind == 'cuda0d': continue
                f32, narrow = torch.tensor(value).float().item(), torch.tensor(value).to(dt).float().item()
                for name, op in (('add', lambda a, b: a + b), ('sub', lambda a, b: a - b), ('mul', lambda a, b: a * b), ('div', lambda a, b: a / b),
                                 ('rdiv', lambda a, b: b / a), ('rsub', lambda a, b: b - a)):
                    got = op(x, s)
                    a = op(x.float(), torch.tensor(f32, device=device)).to(dt); b = op(x.float(), torch.tensor(narrow, device=device)).to(dt)
                    rows.append({'device': device, 'dtype': str(dt), 'value': value, 'operand': kind, 'op': name,
                                 'f32_value': int((got == a).sum()), 'dtype_value': int((got == b).sum()), 'elements': x.numel(), 'result_dtype': str(got.dtype)})
                y = x.clone(); y /= s
                b = (x.float() / torch.tensor(torch.tensor(value).to(dt).float().item(), device=device)).to(dt); a = (x.float() / torch.tensor(value, device=device)).to(dt)
                rows.append({'device': device, 'dtype': str(dt), 'value': value, 'operand': kind, 'op': 'idiv', 'f32_value': int((y == a).sum()), 'dtype_value': int((y == b).sum()), 'elements': x.numel()})
summary = {}
for r in rows:
    key = (r['device'], r['operand'])
    verdict = 'f32' if r['f32_value'] == r['elements'] and r['dtype_value'] != r['elements'] else 'dtype' if r['dtype_value'] == r['elements'] and r['f32_value'] != r['elements'] else 'both' if r['f32_value'] == r['dtype_value'] == r['elements'] else 'neither'
    summary.setdefault(' '.join(key), {}).setdefault(verdict, 0); summary[' '.join(key)][verdict] += 1
print(json.dumps(summary, indent=1))
print(json.dumps([r for r in rows if not (r['f32_value'] == r['elements'] or r['dtype_value'] == r['elements'])][:10]))
json.dump(rows, open('probe-zero-dim.json', 'w'), indent=1)
