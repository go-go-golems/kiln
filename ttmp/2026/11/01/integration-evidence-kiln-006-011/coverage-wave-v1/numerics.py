"""Coverage wave (integration Step 9+): compare Kiln's frontend reference and compiled Loop IR (a100,
separate contraction, FP32 products) with eager PyTorch on CPU for every graph of the given families.

Usage: python3 numerics.py REPO_ROOT UPSTREAM_ROOT OUT.json [--jobs J] [--timeout S] [--dist randn|rand] SAMPLE_SUFFIX...
  SAMPLE_SUFFIX  the end of a family's sample path (e.g. 64207d746493); every graph in its graph_list.txt runs,
                 each in its own process (J at a time, S seconds each; a timeout is recorded, not retried).
  KILN_NUMERICS_MAX_DIM  cap every input dimension at this size (for shape-generic graphs too large for the
                 evaluator, e.g. DNLNet's [2, 4096, 4096] softmax; a graph with fixed reshapes fails to import and is an error)
  KILN_NUMERICS_LIMIT  input-element limit (default 8000000); larger graphs are recorded as skipped.
  --dist rand    uniform [0, 1) floating inputs (for graphs whose inputs are probabilities, e.g. ConViT's
                 attention maps, where randn makes row sums cancel).
Internal: numerics.py REPO_ROOT UPSTREAM_ROOT --one GRAPH DIST  prints one record as JSON.
Eager PyTorch runs the traced graph's single-device (CPU) propagation copy, so graphs that move tensors to
cuda run on a CPU host. Inputs: seeded randn for floating inputs (cast to the input dtype), randint(0, 2)
for integer and bool inputs (valid embedding ids and masks). Mutated inputs are compared as outputs too.
Each row: max |kiln - eager| in float64, and whether the values are bit-identical. CPU only.
"""
import json, subprocess, sys, pathlib
import torch
root, upstream = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]).resolve()
sys.path.insert(0, str(root / 'integrations/passnet'))
from corpus import load_module, eliminate_dead_code, expose_inplace_results
from fx_trace import trace_module
from fx_export import export_graph, propagation_copy
from fx_import import import_graph

KILN = {torch.float32: 'f32', torch.float16: 'f16', torch.bfloat16: 'bf16', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}


def inputs_for(graph, dist, seed=0):
    metadata = []
    for filename in ('input_meta.py', 'weight_meta.py'):
        module = load_module(upstream / graph / filename)
        metadata.extend(c for c in vars(module).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
    metadata.sort(key=lambda c: int(c.name.split('_')[-1]))
    g = torch.Generator().manual_seed(seed)
    values = []
    for c in metadata:
        dtype = getattr(torch, c.dtype.split('.')[-1])
        draw = torch.rand if dist == 'rand' else torch.randn
        shape = [min(d, MAX_DIM) for d in c.shape] if MAX_DIM else c.shape
        values.append(draw(shape, generator=g).to(dtype) if dtype.is_floating_point else torch.randint(0, 2, shape, generator=g, dtype=dtype))
    return values


def encode(v):
    if v.dtype.is_floating_point: return [x if x == x and abs(x) != float('inf') else str(x).replace('inf', 'Infinity').replace('nan', 'NaN') for x in v.float().flatten().tolist()]
    return v.flatten().tolist()


MAX_DIM = int(__import__('os').environ.get('KILN_NUMERICS_MAX_DIM', 0))  # cap every input dimension (shape-generic graphs only)
LIMIT = int(__import__('os').environ.get('KILN_NUMERICS_LIMIT', 8_000_000))  # input elements: the JS evaluator receives every input as a JSON number list


def check(graph, dist):
    model = load_module(upstream / graph / 'model.py').GraphModule()
    values = inputs_for(graph, dist)
    if sum(v.numel() for v in values) > LIMIT: return {'skipped': f'{sum(v.numel() for v in values)} input elements exceed the CPU evaluator limit {LIMIT}'}
    traced = trace_module(model); eliminate_dead_code(traced.graph); expose_inplace_results(traced.graph)
    eager, _ = propagation_copy(traced, torch.device('cpu'))
    clones = [v.clone() for v in values]
    with torch.no_grad(): want = eager(*clones)
    imported = import_graph(export_graph(traced, values))
    names = list(imported['inputs'])
    request = {'script': imported['script'], 'inputs': {n: {'shape': list(v.shape), 'dtype': KILN[v.dtype], 'data': encode(v)} for n, v in zip(names, values)}}
    result = json.loads(subprocess.run(['node', str(root / 'integrations/passnet/kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True).stdout or '{"error": "kiln_eval produced no output"}')
    if result.get('error') and not result.get('frontend'): return {'error': result['error']}
    want = list(want) if isinstance(want, (tuple, list)) else [want]
    flat = []
    def walk(structure, value):
        if 'output' in structure: flat.append((structure['output'], value))
        elif 'input_alias' in structure: flat.append((f'__mut{structure["input_alias"]}', value))
        else:
            items = next(iter(structure.values()))
            for s, v in zip(items, value if not isinstance(items, dict) else value.values()): walk(s, v)
    walk(imported['output_structure'], want if set(imported['output_structure']) & {'tuple', 'list'} else want[0])
    flat += [(m['output'], clones[m['input_index']]) for m in imported['input_mutations']]
    rows = {}
    for key, w in flat:
        for level in ('frontend', 'loop'):
            if result.get(level) is None: rows[f'{level}.{key}'] = {'error': result.get('error')}; continue
            got = torch.tensor([float(x) for x in result[level][key]], dtype=torch.float64).reshape(w.shape)
            ref = w.to(torch.float64)
            both_nan = got.isnan() & ref.isnan()
            diff = torch.where(both_nan, torch.zeros_like(got), (got - ref).abs())
            diff = torch.where((got == ref), torch.zeros_like(diff), diff)
            rows[f'{level}.{key}'] = {'dtype': str(w.dtype), 'shape': list(w.shape),
                                      'max_abs_diff': float(diff.max()) if diff.numel() else 0.0,
                                      'max_ref': float(ref[ref.isfinite()].abs().max()) if ref.isfinite().any() else 0.0,
                                      'exact': bool((diff == 0).all())}
    return rows


TOLERANCE = {'torch.float32': 1e-4, 'torch.float16': 1e-2, 'torch.bfloat16': 4e-2}


def verdict(rows):
    """exact, within (max |diff| <= tol * max(1, max |ref|), tol by dtype; integers and bool must be exact) or outside."""
    if 'skipped' in rows: return 'skipped'
    if 'error' in rows or any('error' in r for r in rows.values()): return 'error'
    if all(r['exact'] for r in rows.values()): return 'exact'
    ok = all(r['exact'] or r['max_abs_diff'] <= TOLERANCE.get(r['dtype'], 0) * max(1.0, r['max_ref']) for r in rows.values())
    return 'within' if ok else 'outside'


if sys.argv[3] == '--one':
    try: rows = check(sys.argv[4], sys.argv[5])
    except Exception as e: rows = {'error': f'{type(e).__name__}: {e}'[:400]}
    print(json.dumps(rows)); sys.exit(0)

import argparse, concurrent.futures, time
parser = argparse.ArgumentParser(); parser.add_argument('root'); parser.add_argument('upstream'); parser.add_argument('out', type=pathlib.Path)
parser.add_argument('--jobs', type=int, default=4); parser.add_argument('--timeout', type=int, default=900); parser.add_argument('--dist', default='randn')
parser.add_argument('--graphs', type=pathlib.Path, help='run only the graphs listed in this file (one per line)')
parser.add_argument('suffixes', nargs='+')
args = parser.parse_args()
tasks = (upstream / 'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().split()
work = [(i, s, g) for i, s in enumerate(tasks) if any(s.endswith(x) for x in args.suffixes) for g in (upstream / s / 'graph_list.txt').read_text().split()]
if args.graphs: work = [w for w in work if w[2] in set(args.graphs.read_text().split())]


def one(item):
    task, sample, graph = item
    start = time.time()
    try:
        done = subprocess.run([sys.executable, __file__, str(root), str(upstream), '--one', graph, args.dist], capture_output=True, text=True, timeout=args.timeout)
        rows = json.loads(done.stdout.strip().splitlines()[-1]) if done.stdout.strip() else {'error': done.stderr[-400:]}
    except subprocess.TimeoutExpired: rows = {'error': f'timeout after {args.timeout} s'}
    return {'task': task, 'sample': sample, 'graph': graph, 'dist': args.dist, 'max_dim': MAX_DIM or None, 'verdict': verdict(rows), 'seconds': round(time.time() - start, 1), 'rows': rows}


records = []
with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
    for rec in pool.map(one, work):
        records.append(rec)
        worst = max((r.get('max_abs_diff', 0) for r in rec['rows'].values() if isinstance(r, dict) and 'max_abs_diff' in r), default=None)
        print(rec['task'], rec['graph'].split('/')[4], rec['graph'].split('/')[-1][:50], rec['verdict'], f'max_abs_diff={worst}', str(rec['rows'].get('error') or rec['rows'].get('skipped') or '')[:200], f'{rec["seconds"]}s', flush=True)
        args.out.write_text(json.dumps({'format': 'kiln-coverage-numerics/1', 'torch': torch.__version__, 'dist': args.dist, 'records': records}, indent=1) + '\n')
