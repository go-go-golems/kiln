"""KILN-010 step 4: can the importer's symbolic tracer keep factory calls as graph nodes?

Prototype only (not wired into integrations/passnet): while MutationTracer traces, torch.arange,
torch.zeros, torch.ones, torch.full and torch.functional.meshgrid are replaced by wrappers that emit
call_function nodes targeting the original functions. Then ShapeProp runs on real CPU tensors and
the exporter (fx_export.export_graph) must accept the graph. Usage: python3 04-...py REPO_ROOT
"""
import contextlib, importlib.util, sys, pathlib, torch
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root / 'integrations/passnet'))
import operator
from fx_trace import MutationTracer, MutationProxy

# FX's Proxy defines no __setitem__; record x[index] = value as an operator.setitem node
class SetitemProxy(MutationProxy):
    def __setitem__(self, index, value):
        self.tracer.create_proxy('call_function', operator.setitem, (self, index, value), {})

class FactoryTracer(MutationTracer):
    def proxy(self, node): return SetitemProxy(node, self)
from fx_export import export_graph
U = root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/9/samples'
FACTORIES = [(torch, 'arange'), (torch, 'zeros'), (torch, 'ones'), (torch, 'full'), (torch.functional, 'meshgrid')]

@contextlib.contextmanager
def proxied_factories(tracer):
    saved = [(m, n, getattr(m, n)) for m, n in FACTORIES]
    def wrap(original):
        def call(*args, **kwargs): return tracer.create_proxy('call_function', original, args, kwargs)
        return call
    try:
        for m, n, f in saved: setattr(m, n, wrap(f))
        yield
    finally:
        for m, n, f in saved: setattr(m, n, f)

def load(path):
    spec = importlib.util.spec_from_file_location('m', path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m.GraphModule()
cases = [('transformers-auto-model/microsoft_beit-base-patch16-384/_decomposed/microsoft_beit-base-patch16-384_start23_end52_2', [torch.zeros(1, 1, 768), torch.zeros(1, 1, 768)]),
         ('timm/convit_tiny/_decomposed/convit_tiny_start6_end25_1', [torch.zeros(192), torch.ones(192), torch.zeros(1, 196, 192)])]
for g, inputs in cases:
    tracer = FactoryTracer()
    with proxied_factories(tracer):
        graph = tracer.trace(load(U / g / 'model.py'))
    gm = torch.fx.GraphModule(tracer.root, graph)
    exported = export_graph(gm, inputs)
    targets = [n['target'] for n in exported['nodes'] if n['kind'] in ('call_function', 'call_method')]
    print('==', g.split('/')[-1], 'get_attr:', sum(n['kind'] == 'get_attr' for n in exported['nodes']), 'nodes:', len(exported['nodes']))
    print('  ', sorted(set(targets)))
    setitems = [n for n in exported['nodes'] if n['target'] == '_operator.setitem']
    print('   setitem example meta:', setitems[0]['tensor_meta'], 'args:', str(setitems[0]['args'])[:160])
