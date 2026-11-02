"""Import census of every KILN-005 views-ops census graph on the given Kiln tree; per-record errors kept."""
import json, sys, pathlib
root, upstream, out = map(pathlib.Path, sys.argv[1:4])
sys.path.insert(0, str(root / 'integrations/passnet'))
from corpus import translate_graph
frozen = json.loads((root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/views-ops-import-v1.json').read_text())
records = []
for r in frozen['records']:
    try:
        translate_graph(upstream, r['graph'], 'fake'); now = {'status': 'imported'}
    except Exception as e:
        now = {'status': 'blocked', 'error_type': type(e).__name__, 'error': str(e)[:400]}
    records.append({'sample': r['sample'], 'graph': r['graph'], 'before': r['status'], **now})
out.write_text(json.dumps({'records': records}, indent=1))
print(sum(r['status'] == 'imported' for r in records), len(records))
