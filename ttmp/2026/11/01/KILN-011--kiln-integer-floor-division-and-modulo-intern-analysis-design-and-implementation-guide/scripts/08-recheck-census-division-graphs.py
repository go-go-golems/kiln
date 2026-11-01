"""KILN-011: every census graph that imported before (views-ops-import-v1.json) and whose forward has //, % or
rounding_mode still imports with the new division lowering. Usage: python3 08-... <upstream> <census json> <repo root>"""
import json, re, sys
from pathlib import Path
upstream, census, repo = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
sys.path.insert(0, str(repo / 'integrations/passnet'))
from corpus import translate_graph
PATTERN = re.compile(r'(?<![/%])(//|%)(?!=)|rounding_mode')
recs = json.loads(census.read_text())['records']
n = ok = 0
for r in recs:
    if r['status'] != 'imported': continue
    p = upstream / r['graph'] / 'model.py'
    if not p.exists(): continue
    body = p.read_text().split('def forward', 1)[-1]
    if not PATTERN.search(body): continue
    n += 1
    try: translate_graph(upstream, r['graph'], 'fake'); ok += 1
    except Exception as e: print('REGRESSION', r['graph'], type(e).__name__, e)
print(f'{n} census-imported graphs whose forward has //, % or rounding_mode; {ok} still import')
