"""KILN-010 step: re-run the import census on the 20 records the KILN-005 census blocked with get_attr
(17) or new_zeros (3), and compare Kiln's frontend and compiled Loop IR references with eager PyTorch
on CPU for every variant that imports.

Usage: python3 06-import-census-and-reference.py REPO_ROOT UPSTREAM_ROOT OUT.json
  REPO_ROOT      the worktree (integrations/passnet is imported from it)
  UPSTREAM_ROOT  KILN-005 sources/upstream (read only)
Writes a JSON summary; prints one line per record. CPU only: no GPU, no PassBench.
"""
import json, subprocess, sys, pathlib, importlib.util
import torch
root, upstream, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
sys.path.insert(0, str(root / 'integrations/passnet'))
from corpus import translate_graph, load_module, eliminate_dead_code
from fx_trace import trace_module
from fx_export import export_graph
from fx_import import import_graph

census = json.loads((root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/views-ops-import-v1.json').read_text())
targets = [r for r in census['records'] if r['status'] == 'blocked' and ('get_attr' in r['error'] or 'new_zeros' in r['error'])]
KILN = {torch.float32: 'f32', torch.float16: 'f16', torch.bfloat16: 'bf16', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}


def inputs_for(graph):
    metadata = []
    for filename in ('input_meta.py', 'weight_meta.py'):
        module = load_module(upstream / graph / filename)
        metadata.extend(c for c in vars(module).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
    metadata.sort(key=lambda c: int(c.name.split('_')[-1]))
    g = torch.Generator().manual_seed(0)
    values = []
    for c in metadata:
        dtype = getattr(torch, c.dtype.split('.')[-1])
        values.append(torch.randint(0, 2, c.shape, generator=g, dtype=dtype) if not dtype.is_floating_point else torch.randn(c.shape, generator=g).to(dtype))
    return values


def reference_check(graph):
    model = load_module(upstream / graph / 'model.py').GraphModule()
    values = inputs_for(graph)
    with torch.no_grad(): want = model(*[v.clone() for v in values])
    traced = trace_module(model); eliminate_dead_code(traced.graph)
    imported = import_graph(export_graph(traced, values))
    names = list(imported['inputs'])
    request = {'script': imported['script'], 'inputs': {n: {'shape': list(v.shape), 'dtype': KILN[v.dtype], 'data': [None if x != x else x for x in v.float().flatten().tolist()] if v.dtype.is_floating_point else v.flatten().tolist()} for n, v in zip(names, values)}}
    result = json.loads(subprocess.run(['node', str(root / 'integrations/passnet/kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True, check=True).stdout)
    if result.get('error'): return {'error': result['error']}
    want = want if isinstance(want, tuple) else (want,)
    keys = [k for k in result['frontend'] if not k.startswith('__mut')]
    rows = {}
    for key, w in zip(keys, want):
        for level in ('frontend', 'loop'):
            got = torch.tensor(result[level][key], dtype=torch.float64).reshape(w.shape)
            diff = (got - w.to(torch.float64)).abs()
            rows[f'{level}.{key}'] = {'dtype': str(w.dtype), 'shape': list(w.shape), 'max_abs_diff': float(diff.max()) if diff.numel() else 0.0, 'exact': bool(torch.equal(got, w.to(torch.float64)))}
    return rows


records = []
for r in targets:
    rec = {'graph': r['graph'], 'before': r['error'][:80]}
    try:
        translate_graph(upstream, r['graph'], 'fake')
        rec['status'] = 'imported'
    except Exception as e:
        rec['status'] = 'blocked'; rec['error'] = f'{type(e).__name__}: {e}'[:300]
    if rec['status'] == 'imported' and '/float32/' in r['graph']:
        try: rec['reference'] = reference_check(r['graph'])
        except Exception as e: rec['reference'] = {'error': f'{type(e).__name__}: {e}'[:300]}
    records.append(rec)
    print(rec['status'], r['graph'].split('/')[-1], rec.get('error', ''), json.dumps(rec.get('reference', ''))[:300], flush=True)
out.write_text(json.dumps({'format': 'kiln-010-import-census/1', 'torch': torch.__version__, 'records': records,
                           'imported': sum(r['status'] == 'imported' for r in records), 'total': len(records)}, indent=2) + '\n')
print(f"{sum(r['status'] == 'imported' for r in records)} / {len(records)} imported")
