"""Inspect the current B1 import frontier without altering compiler behavior."""
import collections
import json
import re
import sys
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
upstream = sources / 'upstream'
sys.path.insert(0, str(Path.cwd() / 'integrations/passnet'))
from corpus import load_module
from fx_trace import trace_module

rows = json.loads((sources / 'coverage-roadmap-import-audit-v1.json').read_text())['records']
typed = [row for row in rows if 'only supported floating tensor inputs accepted' in row.get('error', '')]
constant = [row for row in rows if 'unsupported FX node kind get_attr' in row.get('error', '')]
typed_records = []
for row in typed:
    graph = upstream / row['graph']
    metadata = (graph / 'input_meta.py').read_text() + (graph / 'weight_meta.py').read_text()
    dtypes = collections.Counter(re.findall(r'dtype\s*=\s*["\']([^"\']+)', metadata))
    typed_records.append({'sample': row['sample'], 'graph': row['graph'], 'dtypes': dict(dtypes)})
constant_records = []
for row in constant:
    model = load_module(upstream / row['graph'] / 'model.py').GraphModule()
    traced = trace_module(model)
    attrs = []
    for node in traced.graph.nodes:
        if node.op != 'get_attr':
            continue
        value = traced
        for segment in str(node.target).split('.'):
            value = getattr(value, segment)
        attrs.append({'target': str(node.target), 'dtype': str(getattr(value, 'dtype', type(value).__name__)),
                      'shape': list(value.shape) if hasattr(value, 'shape') else None,
                      'elements': value.numel() if hasattr(value, 'numel') else None})
    constant_records.append({'sample': row['sample'], 'graph': row['graph'], 'attributes': attrs})
result = {'format': 'kiln-b1-frontier-census/1',
          'typed_input_graphs': len(typed), 'typed_input_families': len({row['sample'] for row in typed}),
          'constant_graphs': len(constant), 'constant_families': len({row['sample'] for row in constant}),
          'dtype_declarations': dict(sum((collections.Counter(row['dtypes']) for row in typed_records), collections.Counter())),
          'typed_records': typed_records, 'constant_records': constant_records}
(sources / 'b1-typed-constant-frontier-v1.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if not key.endswith('_records')}, indent=2))
