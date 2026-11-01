#!/usr/bin/env python3
"""Localize where Kiln's rounding differs from eager PyTorch, on CUDA, per graph of a compiled corpus.

usage (inside the evaluator image, from a directory holding kiln/, upstream/ and the corpus):
  python3 localize.py --kiln KILN --upstream UPSTREAM --corpus CORPUS --output OUT.json [--graph I ...]

For every manifest variant (or the selected indices):
  - inputs are the evaluator's (pass_bench.torch.test_compiler.get_input_dict, device cuda), and eager runs
    with the evaluator's runtime seed (1024);
  - Kiln runs the compiled artifact through CorpusDispatch with the record's specialization; outputs are
    mapped back to source order with output_permutation;
  - float64: the same source model on float64 copies of the floating inputs;
  - per output: max |kiln - eager|, |kiln - f64|, |eager - f64|, how many elements differ, PassBench's
    allclose decision at tolerances -5/-4/-3 (pass_bench.datatype_tolerance_config.get_precision), the
    elements failing at -5 and the worst ones with their kiln/eager/f64 values;
  - hybrids: the traced source graph is interpreted eagerly, except that one node (or every node) is
    computed from its eager arguments in float64 (or float32) and rounded to its eager dtype. A hybrid
    whose outputs equal Kiln's (or fail PassBench against eager where Kiln does) names the rounding point
    at which Kiln's policy differs from PyTorch's. Nodes that update storage in place are not replaced.
Diagnostic only: no correctness claim; the evaluator's own curve decides acceptance.
"""
import argparse, json, sys
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--kiln', type=Path, required=True)
p.add_argument('--upstream', type=Path, required=True)
p.add_argument('--corpus', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--graph', type=int, action='append')
p.add_argument('--no-hybrids', action='store_true')
a = p.parse_args()
sys.path[:0] = [str(a.kiln / 'runtime/python'), str(a.kiln / 'integrations/passnet'), str(a.upstream)]
import torch
from corpus import read_manifest, load_module, canonical_order_inputs, inplace_node
from dispatch import CorpusDispatch
from fx_trace import trace_module
from pass_bench.datatype_tolerance_config import get_precision
from pass_bench.torch.test_compiler import get_input_dict

TOLERANCES = (-5, -4, -3)


def tolist(value):
    return list(value) if isinstance(value, (tuple, list)) else [value]


def upcast(value, dtype):
    if isinstance(value, torch.Tensor) and value.is_floating_point(): return value.to(dtype)
    if isinstance(value, (tuple, list)): return type(value)(upcast(v, dtype) for v in value)
    if isinstance(value, dict): return {k: upcast(v, dtype) for k, v in value.items()}
    return value


def like(value, reference):
    if isinstance(reference, torch.Tensor) and isinstance(value, torch.Tensor): return value.to(reference.dtype)
    if isinstance(reference, (tuple, list)): return type(reference)(like(v, r) for v, r in zip(value, reference))
    return value


class Hybrid(torch.fx.Interpreter):
    """Eager interpretation; the nodes in `targets` compute in `dtype` from their eager arguments and round."""
    def __init__(self, module, targets, dtype):
        super().__init__(module); self.targets = targets; self.dtype = dtype

    def run_node(self, n):
        result = super().run_node(n)
        if n.name in self.targets:
            args, kwargs = self.fetch_args_kwargs_from_env(n)
            wide = getattr(self, n.op)(n.target, upcast(args, self.dtype), upcast(kwargs, self.dtype))
            result = like(wide, result)
        return result


def replaceable(module):
    out = []
    for n in module.graph.nodes:
        if n.op not in ('call_function', 'call_method') or inplace_node(n): continue
        if n.target is __import__('operator').setitem or n.target is __import__('operator').getitem: continue
        meta = [m for m in tolist(n.meta.get('val', None)) if m is not None]
        out.append(n.name)
    return out


def compare(kiln, eager, wide):
    rows = []
    for i, (k, e, w) in enumerate(zip(kiln, eager, wide)):
        row = {'index': i, 'dtype': str(e.dtype).removeprefix('torch.'), 'shape': list(e.shape)}
        if not e.is_floating_point():
            row['equal'] = bool(torch.equal(k, e)); rows.append(row); continue
        k64, e64, w64 = k.double(), e.double(), w.double()
        row.update(max_kiln_eager=float((k64 - e64).abs().max()), max_kiln_f64=float((k64 - w64).abs().max()),
                   max_eager_f64=float((e64 - w64).abs().max()), max_ref=float(e64.abs().max()),
                   differ=int((k != e).sum()), elements=e.numel())
        wr = w.to(e.dtype)  # float64 reference rounded to the output dtype
        row['kiln_is_rounded_f64'] = int((k == wr).sum()); row['eager_is_rounded_f64'] = int((e == wr).sum())
        for t in TOLERANCES:
            rtol, atol = get_precision(t, row['dtype'])
            bad = (k64 - e64).abs() > atol + rtol * e64.abs()
            row[f'fail_{t}'] = int(bad.sum())
        rtol, atol = get_precision(-5, row['dtype'])
        excess = ((k64 - e64).abs() - (atol + rtol * e64.abs())).flatten()
        worst = excess.topk(min(5, excess.numel())).indices
        row['worst'] = [{'flat': int(j), 'kiln': float(k64.flatten()[j]), 'eager': float(e64.flatten()[j]), 'f64': float(w64.flatten()[j])} for j in worst]
        rows.append(row)
    return rows


def summary(outputs, reference):
    """Elements differing from `reference` and failing PassBench at -5 against it, over all outputs."""
    differ = fail = 0
    for o, r in zip(outputs, reference):
        if not r.is_floating_point(): differ += int((o != r).sum()); continue
        rtol, atol = get_precision(-5, str(r.dtype).removeprefix('torch.'))
        differ += int((o != r).sum()); fail += int(((o.double() - r.double()).abs() > atol + rtol * r.double().abs()).sum())
    return {'differ': differ, 'fail_-5': fail}


manifest = read_manifest(a.corpus)
dispatch = CorpusDispatch(a.corpus, include_paths=['/usr/local/cuda/include'])
report = {'format': 'kiln-rounding-localization/1', 'corpus': str(a.corpus), 'records': []}
for index, record in enumerate(manifest['variants']):
    if a.graph and index not in a.graph: continue
    source = a.upstream / record['graph']
    model = load_module(source / 'model.py').GraphModule().cuda().eval()
    named = get_input_dict(argparse.Namespace(model_path=str(source), device='cuda'))
    names = [n for n in __import__('inspect').signature(model.forward).parameters if n != 'self']
    inputs = [named[n] for n in names]
    with torch.no_grad():
        torch.manual_seed(1024); eager = tolist(model(*[x.clone() for x in inputs]))
        torch.manual_seed(1024); wide = tolist(model(*[upcast(x.clone(), torch.float64) for x in inputs]))
        produced = tolist(dispatch(*canonical_order_inputs(record, [x.clone() for x in inputs]), specialization=tuple(record['specialization'])))
        permutation = record.get('output_permutation', list(range(len(produced))))
        kiln = [None] * len(produced)
        for position, value in zip(permutation, produced): kiln[position] = value
        kiln = kiln[:len(eager)]
        entry = {'graph': record['graph'], 'outputs': compare(kiln, eager, wide)}
        if not a.no_hybrids:
            traced = trace_module(load_module(source / 'model.py').GraphModule()).cuda()
            torch.manual_seed(1024); plain = tolist(Hybrid(traced, set(), torch.float64).run(*[x.clone() for x in inputs]))
            entry['traced_equals_eager'] = all(torch.equal(x, y) for x, y in zip(plain, eager))
            nodes = replaceable(traced); hybrids = {}
            for label, targets, dtype in ([('all@f64', set(nodes), torch.float64), ('all@f32', set(nodes), torch.float32)] +
                                          [(f'{n}@{d}', {n}, t) for n in nodes for d, t in (('f64', torch.float64), ('f32', torch.float32))]):
                try:
                    torch.manual_seed(1024); out = tolist(Hybrid(traced, targets, dtype).run(*[x.clone() for x in inputs]))[:len(eager)]
                    hybrids[label] = {'vs_kiln': summary(out, kiln), 'vs_eager': summary(out, eager)}
                except Exception as error:
                    hybrids[label] = {'error': f'{type(error).__name__}: {error}'[:200]}
            entry['kiln_vs_eager'] = summary(kiln, eager)
            entry['hybrids'] = hybrids
            entry['nodes'] = [f'{n.name} = {n.op}:{getattr(n.target, "__name__", n.target)}' for n in traced.graph.nodes if n.op in ('call_function', 'call_method')]
    report['records'].append(entry)
    worst = [(o.get('fail_-5'), o.get('max_kiln_eager')) for o in entry['outputs']]
    print(index, record['graph'].split('/')[3], record['graph'].split('/')[-1][:50], 'fail@-5/max per output', worst, flush=True)
    a.output.write_text(json.dumps(report, indent=1) + '\n')
dispatch.close()
