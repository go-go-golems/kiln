#!/usr/bin/env python3
"""Rule-selection check for device-literal graphs on a CPU-only host (KILN-009 Phase 4).

Takes a task directory written by KILN-005 script 658 (corpus/ and passes/), substitutes
device(type='meta') for device(type='cuda', index=0) in every generated rule's pattern and in
every source model, captures each source with TorchDynamo on meta tensors, normalizes it as the
evaluator does (fx_normalize.normalize_arguments), and applies the upstream SubgraphMatcher with
PassBench's settings in sorted_output_pass_rule_names order. A graph is ok when the first rule that
matches is its own specialization and matches exactly once. Structure only: PassBench evidence
needs the CUDA evaluator.

usage: 08-match-generated-rules-meta-device.py --task-dir DIR --upstream DIR --output report.json
"""
import argparse, importlib.util, json, shutil, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(ROOT / 'integrations/passnet'))
import torch
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from corpus import load_module, read_manifest
from fx_normalize import normalize_arguments, trace_pattern

CUDA, META = "device(type='cuda', index=0)", "device(type='meta')"
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--task-dir', required=True, type=Path)
p.add_argument('--upstream', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
a = p.parse_args()
passes, corpus = a.task_dir / 'passes', a.task_dir / 'corpus'
tmp = Path(tempfile.mkdtemp())
(tmp / '_kiln_generated_runtime.py').write_text('def kiln_generated(*args):\n raise RuntimeError("simulation")\n')
rules = []
for name in json.loads((passes / 'sorted_output_pass_rule_names.json').read_text()):
    (tmp / f'{name}.py').write_text((passes / f'{name}.py').read_text().replace(CUDA, META))
    spec = importlib.util.spec_from_file_location(name, tmp / f'{name}.py'); module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(tmp)); spec.loader.exec_module(module); sys.path.pop(0)
    pattern = trace_pattern(module.pattern); normalize_arguments(pattern)
    rules.append((int(name.removeprefix('KilnPattern')), pattern))
records = []
for record in read_manifest(corpus)['variants']:
    src = a.upstream / record['graph']; g = tmp / 'graph'; shutil.rmtree(g, ignore_errors=True); g.mkdir()
    for f in ('input_meta.py', 'weight_meta.py'): shutil.copy(src / f, g / f)
    (g / 'model.py').write_text((src / 'model.py').read_text().replace(CUDA, META))
    meta = []
    for f in ('input_meta.py', 'weight_meta.py'):
        m = load_module(g / f); meta.extend(c for c in vars(m).values() if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
    meta.sort(key=lambda c: int(c.name.split('_')[-1]))
    inputs = [torch.empty(c.shape, dtype=getattr(torch, c.dtype.split('.')[-1]), device='meta') for c in meta]
    graphs = []; torch._dynamo.reset()
    torch.compile(load_module(g / 'model.py').GraphModule(), backend=lambda gm, ex: (graphs.append(gm), gm.forward)[1], dynamic=False, fullgraph=True)(*inputs)
    target = graphs[0]; changed = normalize_arguments(target)
    applied, count, errors, returning = None, 0, {}, None
    for identity, pattern in rules:
        try:
            matches = SubgraphMatcher(pattern.graph, match_output=False, match_placeholder=False, remove_overlapping_matches=True, ignore_literals=False).match(target.graph)
        except Exception as error:
            errors[identity] = f'{type(error).__name__}: {error}'; continue
        if matches and applied is None: applied, count, returning = identity, len(matches), [n.name for n in matches[0].returning_nodes]
    records.append({'graph': record['graph'], 'compiled': record['specialization'][0], 'applied': applied, 'matches': count,
                    'returning_nodes': returning, 'normalization': changed, 'rule_errors': errors,
                    'ok': applied == record['specialization'][0] and count == 1})
    print(record['script'], records[-1]['ok'], applied, count, returning, errors or '', flush=True)
a.output.write_text(json.dumps({'format': 'kiln-pattern-identity-simulation/1', 'device': 'meta (substituted for cuda:0)', 'task_dir': str(a.task_dir),
                                'identity_ok': sum(r['ok'] for r in records), 'graphs': len(records), 'records': records}, indent=2) + '\n')
print(f"{sum(r['ok'] for r in records)}/{len(records)} identity ok")
