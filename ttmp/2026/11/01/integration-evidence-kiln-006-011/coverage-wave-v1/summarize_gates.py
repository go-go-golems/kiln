"""Combine the coverage wave's CPU gates into one per-family table (gates.json).

Usage: python3 summarize_gates.py OUT/gates.json NUMERICS.json [NUMERICS.json ...]
  NUMERICS  numerics.py outputs in order; a later file's record for a graph replaces an earlier one
            (reruns: the bool fix, larger evaluator limits, longer timeouts, --dist rand for ConViT).
Reads compile-gate.json and simulation-dynamo-cpu.json from this directory.
Per family: numerics verdict counts, compile gate (compiled/graphs), Dynamo simulation (identity ok, CPU-blocked
capture errors, genuine mismatches) and the replay decision with its reason.
"""
import collections, json, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
out, numerics = pathlib.Path(sys.argv[1]), [pathlib.Path(p) for p in sys.argv[2:]]
records = {}
for path in numerics:
    for r in json.loads(path.read_text())['records']: records[r['graph'], r['task']] = dict(r, source=path.name)
gate = {t['index']: t for t in json.loads((here / 'compile-gate.json').read_text())['tasks']}
sim = {t['index']: t for t in json.loads((here / 'simulation-dynamo-cpu.json').read_text())['tasks']}
families = collections.defaultdict(list)
for (graph, task), r in records.items(): families[task].append(r)
rows = []
for task in sorted(families):
    rs = families[task]
    verdicts = collections.Counter(r['verdict'] for r in rs)
    g = gate.get(task, {}); s = sim.get(task, {})
    recs = s.get('records', [])
    blocked = sum('capture_error' in r for r in recs); mismatched = sum(('capture_error' not in r) and not r['ok'] for r in recs)
    numerics_ok = not (verdicts.get('outside') or verdicts.get('error')) and (verdicts.get('exact', 0) + verdicts.get('within', 0)) > 0
    compiled_ok = g.get('compiled') == g.get('graphs') or bool(g.get('manual', {}).get('no_check_ok'))
    replay = numerics_ok and compiled_ok and mismatched == 0
    reason = 'numerics and compile gate pass' + ('; simulation identity ok' if recs and s.get('identity_ok') == len(recs) else f'; simulation CPU-blocked for {blocked}/{len(recs)} graphs (cuda capture)' if blocked else '')
    if not replay:
        reason = 'excluded: ' + ('matcher simulation finds no match (TorchDynamo inlines the pattern call)' if mismatched else 'numerics' if not numerics_ok else 'compile gate')
    rows.append({'task': task, 'sample': rs[0]['sample'], 'graphs': len(rs), 'numerics': dict(verdicts),
                 'numerics_sources': sorted({r['source'] for r in rs}),
                 'worst_relative': max((row['max_abs_diff'] / max(1.0, row['max_ref']) for r in rs for row in r['rows'].values() if isinstance(row, dict) and 'max_abs_diff' in row), default=None),
                 'compile_gate': {'compiled': g.get('compiled'), 'graphs': g.get('graphs'), **({'manual': g['manual']} if 'manual' in g else {})},
                 'simulation': {'identity_ok': s.get('identity_ok'), 'graphs': len(recs), 'cpu_blocked': blocked, 'mismatched': mismatched, 'error': s.get('error')},
                 'replay': replay, 'reason': reason})
out.write_text(json.dumps({'format': 'kiln-coverage-gates/1', 'families': rows}, indent=1) + '\n')
for r in rows: print(r['task'], r['numerics'], f"gate {r['compile_gate']['compiled']}/{r['compile_gate']['graphs']}", f"sim {r['simulation']['identity_ok']}/{r['simulation']['graphs']} blocked {r['simulation']['cpu_blocked']}", 'REPLAY' if r['replay'] else 'no', '-', r['reason'])
print('replay tasks:', ' '.join(str(r['task']) for r in rows if r['replay']), '| graphs', sum(r['graphs'] for r in rows if r['replay']))
