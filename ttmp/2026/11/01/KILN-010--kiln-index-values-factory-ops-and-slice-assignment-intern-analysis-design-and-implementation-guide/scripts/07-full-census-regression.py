"""KILN-010: re-run the whole KILN-005 views-ops import census (same samples, same graphs, fake metadata)
and compare every record's status with the frozen census: no previously imported graph may regress.

Usage: python3 07-full-census-regression.py REPO_ROOT UPSTREAM_ROOT OUT.json   (CPU only)
"""
import json, sys, pathlib
root, upstream, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
sys.path.insert(0, str(root / 'integrations/passnet'))
from corpus import translate_graph
frozen = json.loads((root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/views-ops-import-v1.json').read_text())
records, changes = [], {'blocked->imported': [], 'imported->blocked': [], 'blocked->blocked(other error)': []}
for i, r in enumerate(frozen['records']):
    try:
        translate_graph(upstream, r['graph'], 'fake'); now = {'status': 'imported'}
    except Exception as e:
        now = {'status': 'blocked', 'error_type': type(e).__name__, 'error': str(e)}
    records.append({'graph': r['graph'], 'before': r['status'], **now})
    if r['status'] == 'blocked' and now['status'] == 'imported': changes['blocked->imported'].append(r['graph'])
    elif r['status'] == 'imported' and now['status'] == 'blocked': changes['imported->blocked'].append({'graph': r['graph'], 'error': now['error'][:300]})
    elif r['status'] == 'blocked' and now['error'][:60] != r['error'][:60]: changes['blocked->blocked(other error)'].append({'graph': r['graph'], 'before': r['error'][:120], 'now': now['error'][:120]})
    if i % 100 == 0: print(i, len(frozen['records']), {k: len(v) for k, v in changes.items()}, flush=True)
summary = {'format': 'kiln-010-census-regression/1', 'records': len(records), 'imported_before': sum(r['before'] == 'imported' for r in records),
           'imported_now': sum(r['status'] == 'imported' for r in records), 'changes': changes}
out.write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in summary.items() if k != 'changes'}), {k: len(v) for k, v in changes.items()})
