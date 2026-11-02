#!/usr/bin/env python3
"""KILN-011 Phase 4 fixtures: Kiln scripts exercising every division function over i32, i64 and f32,
with data and literal divisors (positive, negative), compiled by scripts/kiln-export.mjs into
kiln-program/1 artifacts that integrations/passnet/check_integer_division_cuda.py replays on the GPU.
Usage: python3 12-generate-division-programs.py <repo root> [--target a100]"""
import subprocess, sys
from pathlib import Path
repo = Path(sys.argv[1]).resolve()
target = sys.argv[sys.argv.index('--target') + 1] if '--target' in sys.argv else 'a100'
out = Path(__file__).resolve().parents[1] / 'sources' / 'division-cuda-v1'
out.mkdir(parents=True, exist_ok=True)
N = 4096
# Reference inputs for kiln-export's end-to-end check. The default integer reference input is all zeros,
# which divides by zero; these have both signs and no zero divisor. The GPU check draws its own inputs.
INT_DATA = {
    'i32': ('Int32Array', '(i) => ((i * 7919) % 20001) - 10000', '(i) => (((i * 104729) % 199) - 99) || 7'),
    'i64': ('BigInt64Array', '(i) => BigInt(((i * 7919) % 20001) - 10000) * 1000003n', '(i) => BigInt((((i * 104729) % 199) - 99) || 7)'),
}
def data(name, kind, fn):
    return f'{name}: new Tensor([{N}], {kind}.from({{ length: {N} }}, (_, i) => ({fn})(i)))'
def write(name, ref, body, spec):
    (out / f'{name}.kiln.js').write_text(f'project("{name}").data({{ {ref} }}).program(({{{", ".join(spec)}}}) => ({{{body}}}), {{{", ".join(f"{k}: {v}" for k, v in spec.items())}}});\n')
for t in ['i32', 'i64']:
    kind, fa, fb = INT_DATA[t]
    body = ('floordiv: N.floordiv(a, b), remainder: N.remainder(a, b), truncdiv: N.div(a, b, "trunc"), fmod: N.fmod(a, b), '
            'floor_lit: N.floordiv(a, N.int(80)), rem_lit: N.remainder(a, N.int(80)), floor_neg: N.floordiv(a, N.int(-3)), '
            'rem_neg: N.remainder(a, N.int(-3)), trunc_lit: N.div(a, N.int(14), "trunc"), fmod_lit: N.fmod(a, N.int(16)), truediv: N.div(a, b)')
    write(f'division-{t}', f'{data("a", kind, fa)}, {data("b", kind, fb)}', body, {'a': f'k.tensor([{N}], "{t}")', 'b': f'k.tensor([{N}], "{t}")'})
body = ('floordiv: N.floordiv(x, y), remainder: N.remainder(x, y), fmod: N.fmod(x, y), truncdiv: N.div(x, y, "trunc"), '
        'floor_lit: N.floordiv(x, 2), mixed: N.floordiv(i, 2.5), mixed_rem: N.remainder(i, 0.75), floored: N.floor(i)')
write('division-f32', data('i', 'BigInt64Array', INT_DATA['i64'][1]), body, {'x': f'k.tensor([{N}])', 'y': f'k.tensor([{N}])', 'i': f'k.tensor([{N}], "i64")'})
for name in ['division-i32', 'division-i64', 'division-f32']:
    subprocess.run(['node', 'scripts/kiln-export.mjs', '--script', str(out / f'{name}.kiln.js'), '--target', target, '--out', str(out / f'{name}.json')], cwd=repo, check=True)
    print('exported', name, target)
