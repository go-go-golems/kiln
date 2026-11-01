"""KILN-010 step 2: why do the 17 blocked graphs contain get_attr nodes?

Traces each blocked family's model.py with the importer's MutationTracer (fx_trace.py),
prints every get_attr node, the constant tensor it names, and its users.
Usage: python3 01-trace-get-attr.py REPO_ROOT
"""
import importlib.util, sys, pathlib
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root / 'integrations/passnet'))
from fx_trace import trace_module
U = root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/9/samples'
graphs = ['transformers-auto-model/microsoft_beit-base-patch16-384/_decomposed/microsoft_beit-base-patch16-384_start23_end52_2',
          'timm/convit_tiny/_decomposed/convit_tiny_start6_end25_1',
          'transformers-auto-model/all-mpnet-base-v2/_decomposed/all-mpnet-base-v2_start11_end39_2']
for g in graphs:
    spec = importlib.util.spec_from_file_location('m', U / g / 'model.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    gm = trace_module(m.GraphModule())
    print('==', g.split('/')[-1], 'nodes:', len(gm.graph.nodes))
    for n in gm.graph.nodes:
        if n.op == 'get_attr':
            t = getattr(gm, n.target)
            print('  get_attr', n.name, tuple(t.shape), t.dtype, 'users:', [u.name + ':' + u.op for u in n.users])
            flat = t.flatten()
            print('    first values', flat[:8].tolist(), 'min', flat.min().item(), 'max', flat.max().item())
    print('  ops:', sorted({str(n.target) for n in gm.graph.nodes if n.op == 'call_function'}))
