"""KILN-010 step 3: does TorchDynamo capture keep the factory ops that symbolic tracing folds?

Captures each blocked family's GraphModule through torch.compile with a recording backend on CPU
(the evaluator's backend receives Dynamo graphs; see KILN-005 scripts/658) and prints the call
targets plus every get_attr. Usage: python3 02-dynamo-capture-factories.py REPO_ROOT
"""
import importlib.util, sys, pathlib, torch
root = pathlib.Path(sys.argv[1])
U = root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/9/samples'
graphs = ['transformers-auto-model/microsoft_beit-base-patch16-384/_decomposed/microsoft_beit-base-patch16-384_start23_end52_2',
          'timm/convit_tiny/_decomposed/convit_tiny_start6_end25_1',
          'transformers-auto-model/all-mpnet-base-v2/_decomposed/all-mpnet-base-v2_start11_end39_2']
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
for g in graphs:
    d = U / g
    m = load(d / 'model.py', 'model')
    metas = []
    for f in ('input_meta.py', 'weight_meta.py'):
        if (d / f).exists():
            mm = load(d / f, f[:-3]); metas += [c for c in vars(mm).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name')]
    metas.sort(key=lambda c: int(c.name.split('_')[-1]))
    args = []
    for c in metas:
        dt = getattr(torch, c.dtype.split('.')[-1])
        args.append(torch.zeros(c.shape, dtype=dt) if not dt.is_floating_point else torch.randn(c.shape).to(dt))
    captured = []
    def backend(gm, example_inputs):
        captured.append(gm); return gm.forward
    torch._dynamo.reset()
    torch.compile(m.GraphModule(), backend=backend, fullgraph=True)(*args)
    gm = captured[0]
    print('==', g.split('/')[-1], 'graphs:', len(captured), 'nodes:', len(gm.graph.nodes))
    print('  get_attr:', [n.name for n in gm.graph.nodes if n.op == 'get_attr'])
    from collections import Counter
    print('  targets:', dict(Counter(getattr(n.target, '__name__', str(n.target)) for n in gm.graph.nodes if n.op in ('call_function', 'call_method'))))
