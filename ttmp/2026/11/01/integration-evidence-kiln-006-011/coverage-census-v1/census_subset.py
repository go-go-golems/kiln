"""Import census of the given graphs (JSON list of {sample, graph}) with per-record errors; run on a CUDA host."""
import json, sys, pathlib
root, upstream, todo, out = map(pathlib.Path, sys.argv[1:5])
sys.path.insert(0, str(root / 'integrations/passnet'))
from corpus import translate_graph
records = []
for r in json.loads(todo.read_text()):
    try:
        translate_graph(upstream, r['graph'], 'fake'); now = {'status': 'imported'}
    except Exception as e:
        now = {'status': 'blocked', 'error_type': type(e).__name__, 'error': str(e)[:400]}
    records.append({**r, **now})
out.write_text(json.dumps({'records': records}, indent=1))
print(sum(r['status'] == 'imported' for r in records), len(records))
