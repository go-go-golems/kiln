"""KILN-011: count upstream PassNet graphs that use floor division / modulo / rounding_mode, classify
their operands (dtype, sign range of the dividend from input meta, divisor literal), and check
membership in the KILN-005 views-ops import census.

Usage: python3 -I 01-census-div-mod.py <upstream graphs dir> <views-ops-import-v1.json>
Reads only text; executes nothing from the corpus.
"""
import collections, json, os, re, sys

graphs_dir, census_path = sys.argv[1], sys.argv[2]
census = {r['graph']: r['status'] for r in json.load(open(census_path))['records']}
OPS = {'floordiv': re.compile(r'(\w+) // (\w+)'), 'mod': re.compile(r'(\w+) % (\w+)'),
       'rounding_mode': re.compile(r"torch\.div\((\w+), (\w+), rounding_mode ?= ?'(\w+)'\)"),
       'floor_divide': re.compile(r'floor_divide'), 'remainder': re.compile(r'remainder'), 'fmod': re.compile(r'fmod')}
META = re.compile(r'name = "(\w+)".*?shape = (\[[^\]]*\]).*?dtype = "([\w.]+)".*?max_val = (\S+).*?min_val = (\S+)', re.S)


def meta(d):
    out = {}
    for fname in ('input_meta.py', 'weight_meta.py'):
        p = os.path.join(d, fname)
        if os.path.exists(p):
            for m in META.finditer(open(p).read()):
                out[m.group(1)] = dict(shape=m.group(2), dtype=m.group(3), max=m.group(4), min=m.group(5))
    return out


rows = []
for root, _, files in os.walk(graphs_dir):
    if 'model.py' not in files: continue
    src = open(os.path.join(root, 'model.py')).read()
    body = src.split('def forward', 1)[-1]
    found = [(op, m.groups()) for op, rx in OPS.items() for m in rx.finditer(body)]
    if not found: continue
    rel = os.path.relpath(root, os.path.dirname(graphs_dir))
    rows.append(dict(graph=rel, ops=found, meta=meta(root), census=census.get(rel)))

by_op = collections.Counter(op for r in rows for op in {o for o, _ in r['ops']})
print('graphs with any match:', len(rows))
print('graphs per op:', dict(by_op))
kinds = collections.Counter()
signs = collections.Counter()
divisors = collections.Counter()
for r in rows:
    for op, g in r['ops']:
        if op in ('floordiv', 'mod', 'rounding_mode'):
            a, b = g[0], g[1]
            ma = r['meta'].get(a)
            kinds[(op, ma['dtype'] if ma else 'intermediate')] += 1
            if ma:
                try: signs[(op, 'dividend may be negative' if float(ma['min']) < 0 else 'dividend nonnegative')] += 1
                except ValueError: signs[(op, 'min unknown')] += 1
            divisors[(op, b if b.lstrip('-').isdigit() else 'tensor:' + (r['meta'].get(b, {}).get('dtype', 'intermediate')))] += 1
print('operand dtypes:', dict(kinds))
print('dividend signs:', dict(signs))
print('divisors:', dict(divisors.most_common(20)))
print('census status of matching graphs:', dict(collections.Counter(r['census'] for r in rows)))
neg = [r['graph'] for r in rows if any(float(m['min']) < 0 for m in r['meta'].values() if re.match(r'^-?[\d.e]+$', m['min']))]
print('graphs with a possibly negative input:', len(neg))
for g in neg[:5]: print('  ', g)
families = collections.Counter(r['graph'].split('/samples/')[-1].split('/')[0:2].__str__() for r in rows)
print('distinct source families (framework/model):', len(families))
for f, n in families.most_common(15): print('  ', n, f)

# ---- refinement (added after the first run): separate symbolic-int (SymInt) arithmetic from tensor ops.
# A forward that uses torch.sym_* computes on shape integers at trace time; Kiln never sees a tensor div.
print('\n== refinement: symbolic vs tensor ==')
VAL = re.compile(r'name = "(\w+)".*?shape = (\[[^\]]*\]).*?dtype = "([\w.]+)"(.*?)(?=class |\Z)', re.S)
def meta2(d):
    out = {}
    for fname in ('input_meta.py', 'weight_meta.py'):
        p = os.path.join(d, fname)
        if not os.path.exists(p): continue
        for m in VAL.finditer(open(p).read()):
            rest = m.group(4); lo = None
            mm = re.search(r'min_val = (-?[\d.e]+)', rest)
            if mm: lo = float(mm.group(1))
            md = re.search(r'data = \[([^\]]*)\]', rest)
            if md: lo = min(float(v) for v in md.group(1).split(','))
            out[m.group(1)] = dict(shape=m.group(2), dtype=m.group(3), min=lo)
    return out
sym = [r for r in rows if 'sym_' in open(os.path.join(os.path.dirname(graphs_dir), r['graph'], 'model.py')).read()]
ten = [r for r in rows if r not in sym]
print('symbolic-int graphs:', len(sym), 'census:', dict(collections.Counter(r['census'] for r in sym)))
print('tensor graphs:', len(ten), 'census:', dict(collections.Counter(r['census'] for r in ten)))
for r in ten:
    m = meta2(os.path.join(os.path.dirname(graphs_dir), r['graph']))
    print('  ', r['graph'].split('/samples/')[-1][:90], '|', r['graph'].split('/')[1], '|', [(o, g) for o, g in r['ops']],
          '|', {k: (v['dtype'], v['shape'], v['min']) for k, v in m.items()}, '| census:', r['census'])
