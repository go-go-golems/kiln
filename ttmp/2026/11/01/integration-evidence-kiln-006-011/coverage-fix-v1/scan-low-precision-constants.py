"""Which census graphs contain a float16/bfloat16 splat constant (whose value Kiln now rounds to the dtype)?

usage: scan-low-precision-constants.py REPO UPSTREAM OUT.json
Translates every KILN-005 views-ops census graph and records the N.full(..., "f16"/"bf16") calls of its
script with a value that the dtype does not represent exactly, and N.cast(<f32 0-d constant>, "f16"/"bf16").
CPU only; import errors are skipped.
"""
import json, re, struct, sys, pathlib
root, upstream, out = map(pathlib.Path, sys.argv[1:4])
sys.path.insert(0, str(root / 'integrations/passnet'))
import torch
from corpus import translate_graph
frozen = json.loads((root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/views-ops-import-v1.json').read_text())
FULL = re.compile(r'N\.full\(\[[^\]]*\], (-?[0-9.e+-]+|-?Infinity), "(f16|bf16)"\)')
DT = {'f16': torch.float16, 'bf16': torch.bfloat16}
records = []
for r in frozen['records']:
    try: script = translate_graph(upstream, r['graph'], 'fake')['script']
    except Exception: continue
    inexact = [(v, d) for v, d in FULL.findall(script) if v not in ('Infinity', '-Infinity') and float(torch.tensor(float(v), dtype=torch.float64).to(DT[d])) != float(v)]
    consts = {m.group(1) for m in re.finditer(r'const (v\d+) = N\.expect\(N\.full\(\[\], [^)]*"f32"\)', script)}
    casts = [m.group(0) for m in re.finditer(r'N\.cast\((v\d+), "(f16|bf16)"\)', script) if m.group(1) in consts]
    if inexact or casts: records.append({'sample': r['sample'], 'graph': r['graph'], 'inexact_full': inexact, 'constant_casts': casts})
out.write_text(json.dumps({'format': 'kiln-low-precision-constant-scan/1', 'records': records,
                           'samples': sorted({r['sample'] for r in records})}, indent=1) + '\n')
print(len(records), 'graphs in', len({r['sample'] for r in records}), 'families')
