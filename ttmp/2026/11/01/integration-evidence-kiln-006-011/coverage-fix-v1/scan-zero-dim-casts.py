"""Which census graphs does the 0-d CUDA operand rule (fx_import.cuda_scalar_operand) change?

usage: scan-zero-dim-casts.py REPO UPSTREAM OUT.json
Translates every graph of the KILN-005 views-ops census (as coverage-census-v1/census.py) and records,
per graph, each binary operand the rule narrowed (node, operand index, dtype). Graphs that fail to
import are recorded with their error. CPU only.
"""
import json, sys, pathlib
root, upstream, out = map(pathlib.Path, sys.argv[1:4])
sys.path.insert(0, str(root / 'integrations/passnet'))
import fx_import
from corpus import translate_graph
seen = []
original = fx_import.cuda_scalar_operand
def recording(c, j, text):
    result = original(c, j, text)
    if result != text: seen.append({'node': c.name, 'target': c.target, 'operand': j, 'cast': result})
    return result
fx_import.cuda_scalar_operand = recording
frozen = json.loads((root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/views-ops-import-v1.json').read_text())
records = []
for r in frozen['records']:
    seen.clear()
    try: translate_graph(upstream, r['graph'], 'fake'); status = 'imported'
    except Exception as e: status = f'blocked: {type(e).__name__}'
    records.append({'sample': r['sample'], 'graph': r['graph'], 'status': status, 'narrowed': list(seen)})
changed = [r for r in records if r['narrowed']]
out.write_text(json.dumps({'format': 'kiln-zero-dim-cast-scan/1', 'graphs': len(records), 'changed': len(changed),
                           'changed_samples': sorted({r['sample'] for r in changed}), 'records': changed}, indent=1) + '\n')
print(len(records), 'graphs;', len(changed), 'changed in', len({r['sample'] for r in changed}), 'families')
