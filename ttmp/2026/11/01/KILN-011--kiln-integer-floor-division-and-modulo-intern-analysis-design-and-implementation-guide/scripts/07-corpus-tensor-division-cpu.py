"""KILN-011: import the upstream graphs that divide tensors (//, %, rounding_mode; no torch.sym_*) and
check each against PyTorch CPU: the fake-metadata import the corpus audit uses, then an exact numeric
comparison of Kiln's frontend reference and compiled Loop IR on random inputs with negative dividends.
Usage: python3 07-corpus-tensor-division-cpu.py <upstream dir (contains graphs/)> <repo root> <out.json>"""
import json, os, re, subprocess, sys
from pathlib import Path

upstream, repo, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(repo / 'integrations/passnet'))
import torch
from corpus import load_module, translate_graph, eliminate_dead_code
from fx_trace import trace_module
from fx_export import export_graph
from fx_import import import_graph

KILN_DTYPE = {torch.float32: 'f32', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}
PATTERN = re.compile(r'(?<![/%])(//|%)(?!=)|rounding_mode')
graphs = []
for root, _, files in os.walk(upstream / 'graphs'):
    if 'model.py' not in files: continue
    body = (Path(root) / 'model.py').read_text().split('def forward', 1)[-1]
    if PATTERN.search(body) and 'sym_' not in body: graphs.append(str(Path(root).relative_to(upstream)))
graphs.sort()
records = []
torch.manual_seed(11)
for graph in graphs:
    rec = {'graph': graph}
    try:
        translate_graph(upstream, graph, 'fake')
        rec['import'] = 'imported'
    except Exception as error:
        rec['import'] = f'blocked: {type(error).__name__}: {error}'
        records.append(rec); print(graph, rec['import'], flush=True); continue
    metadata = []
    for filename in ('input_meta.py', 'weight_meta.py'):
        module = load_module(upstream / graph / filename)
        metadata.extend(c for c in vars(module).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
    metadata.sort(key=lambda c: int(c.name.split('_')[-1]))
    values = []
    for c in metadata:
        dtype = getattr(torch, c.dtype.split('.')[-1])
        values.append(torch.randint(-5000, 5000, c.shape, dtype=dtype) if not dtype.is_floating_point else torch.randn(c.shape).to(dtype))
    traced = trace_module(load_module(upstream / graph / 'model.py').GraphModule())
    eliminate_dead_code(traced.graph)
    with torch.no_grad(): want = traced(*[v.clone() for v in values])
    want = want if isinstance(want, (tuple, list)) else (want,)
    imported = import_graph(export_graph(traced, values))
    request = {'script': imported['script'], 'inputs': {n: {'shape': list(v.shape), 'dtype': KILN_DTYPE[v.dtype], 'data': v.flatten().tolist()} for n, v in zip(imported['inputs'], values)}}
    res = json.loads(subprocess.run(['node', str(repo / 'integrations/passnet/kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True, check=True).stdout)
    if res.get('error'): rec['numeric'] = f'error: {res["error"]}'
    else:
        keys = [k for k in res['frontend'] if not k.startswith('__mut')]
        ok = all(res[level][k] == w.flatten().tolist() for level in ('frontend', 'loop') for k, w in zip(keys, want))
        rec['numeric'] = 'exact' if ok and len(keys) == len(want) else 'mismatch'
        rec['ops'] = sorted(set(re.findall(r'N\.(floordiv|remainder|fmod|div)\(', imported['script'])))
        rec['dtypes'] = [str(w.dtype) for w in want]
    records.append(rec); print(graph, rec['import'], rec.get('numeric'), rec.get('ops'), flush=True)
summary = {'graphs': len(records), 'imported': sum(r['import'] == 'imported' for r in records), 'exact': sum(r.get('numeric') == 'exact' for r in records)}
out.write_text(json.dumps({'format': 'kiln-011-corpus-division-cpu/1', 'summary': summary, 'records': records}, indent=2) + '\n')
print(summary)
