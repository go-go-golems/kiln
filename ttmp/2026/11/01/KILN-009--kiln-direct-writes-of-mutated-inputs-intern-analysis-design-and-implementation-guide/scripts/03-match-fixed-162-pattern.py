#!/usr/bin/env python3
"""Match the proposed fixed family-162 pattern (kept in-place result returned) against the TorchDynamo
target graph on a CPU-only host. Both sides substitute device(type='meta') for the CUDA device, so this
checks matcher structure only; PassBench evidence still needs the CUDA evaluator.
usage: 03-match-fixed-162-pattern.py GRAPH_DIRECTORY [--canonical-eq]
--canonical-eq rewrites the target's call_method __eq__ to call_function operator.eq (the spelling the
symbolically traced pattern records) before matching, to separate the two blockers."""
import ast, sys, shutil, tempfile, runpy
from pathlib import Path
here = Path(__file__).resolve().parent
ROOT = here.parents[5]
sys.path.insert(0, str(ROOT / 'integrations/passnet'))
import torch
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
import generate_pass
from corpus import load_module
from fx_normalize import trace_pattern, normalize_arguments
d = Path(sys.argv[1]); tmp = Path(tempfile.mkdtemp())
for f in ('model.py', 'input_meta.py', 'weight_meta.py'): shutil.copy(d / f, tmp / f)
src = (d / 'model.py').read_text().replace("device(type='cuda', index=0)", "device(type='meta')")
(tmp / 'model.py').write_text(src)
original = generate_pass.drop_dead_statements
def drop_and_return(function):
    original(function)
    *body, ret = function.body
    returned = {n.id for n in ast.walk(ret) if isinstance(n, ast.Name)}
    extra = [s.targets[0].id for i, s in enumerate(body) if isinstance(s, ast.Assign) and generate_pass.inplace_call(s.value)
             and isinstance(s.targets[0], ast.Name) and s.targets[0].id not in returned
             and not any(isinstance(n, ast.Name) and n.id == s.targets[0].id for later in body[i+1:] for n in ast.walk(later.value))]
    elts = ret.value.elts if isinstance(ret.value, ast.Tuple) else [ret.value]
    ret.value = ast.Tuple(elts=[*elts, *(ast.Name(id=e, ctx=ast.Load()) for e in extra)], ctx=ast.Load())
generate_pass.drop_dead_statements = drop_and_return
pattern = generate_pass.extract_pattern(src, 2)
ns = {}; exec(compile(pattern.text, '<pattern>', 'exec'), ns)
pg = trace_pattern(ns['pattern']); normalize_arguments(pg)
model = load_module(tmp / 'model.py').GraphModule()
meta = []
for f in ('input_meta.py', 'weight_meta.py'):
    m = load_module(tmp / f); meta.extend(c for c in vars(m).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
meta.sort(key=lambda c: int(c.name.split('_')[-1]))
inputs = [torch.empty(c.shape, dtype=getattr(torch, c.dtype.split('.')[-1]), device='meta') for c in meta]
graphs = []
torch._dynamo.reset()
torch.compile(model, backend=lambda gm, ex: (graphs.append(gm), gm.forward)[1], dynamic=False, fullgraph=True)(*inputs)
target = graphs[0]
if '--canonical-eq' in sys.argv[2:]:
    import operator
    for n in target.graph.nodes:
        if n.op == 'call_method' and n.target == '__eq__': n.op, n.target = 'call_function', operator.eq
    target.recompile()
print('target spellings of ==:', [f'{n.op}:{n.target}' for n in target.graph.nodes if 'eq' in str(n.target)])
normalize_arguments(target)
matches = SubgraphMatcher(pg.graph, match_output=False, match_placeholder=False, remove_overlapping_matches=True, ignore_literals=False).match(target.graph)
print('pattern returns', pattern.returns, 'matches', len(matches))
for m in matches: print('returning nodes:', [n.name for n in m.returning_nodes])
