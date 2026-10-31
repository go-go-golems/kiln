#!/usr/bin/env python3
"""Byte-identity census of the FX importer over all 200 tasks / 2,060 graphs.

For every graph, record sha256 of the generated Kiln script, its input/output metadata, or the
exact first import error. A behavior-preserving importer refactor must reproduce the census
exactly (compare with --compare); intended changes must be listed explicitly.

usage: 661-import-script-census.py --output census.json [--workers N]
       661-import-script-census.py --compare baseline.json candidate.json
"""
import argparse, hashlib, json, sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ROOT = TICKET.parents[4]
UPSTREAM = TICKET / 'sources/upstream'
sys.path.insert(0, str(ROOT / 'integrations/passnet'))


def one(graph):
    from corpus import translate_graph
    try:
        result = translate_graph(UPSTREAM, graph, 'fake')
    except Exception as error:
        return graph, {'status': 'blocked', 'error': f'{type(error).__name__}: {error}'}
    return graph, {'status': 'imported', 'script_sha256': hashlib.sha256(result['script'].encode()).hexdigest(),
                   'metadata_sha256': hashlib.sha256(json.dumps({k: result[k] for k in ('inputs', 'input_dtypes', 'output_structure', 'input_mutations')}, sort_keys=True).encode()).hexdigest()}


def census(output, workers):
    inventory = json.loads((TICKET / 'sources/evaluation-inventory.json').read_text())
    graphs = []
    for sample in inventory['samples']:
        graphs += [g for g in (UPSTREAM / sample['sample'] / 'graph_list.txt').read_text().splitlines() if g.strip()]
    with ProcessPoolExecutor(workers) as pool:
        records = dict(pool.map(one, graphs, chunksize=8))
    imported = sum(r['status'] == 'imported' for r in records.values())
    output.write_text(json.dumps({'format': 'kiln-import-script-census/1', 'graphs': len(records), 'imported': imported,
                                  'records': records}, indent=1, sort_keys=True) + '\n')
    print(len(records), 'graphs;', imported, 'imported')


def compare(baseline, candidate):
    a, b = (json.loads(Path(p).read_text())['records'] for p in (baseline, candidate))
    changed = sorted(g for g in a.keys() | b.keys() if a.get(g) != b.get(g))
    for graph in changed:
        print(graph, '\n  before', a.get(graph), '\n  after ', b.get(graph))
    print(len(changed), 'changed of', len(a))
    return 1 if changed else 0


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path)
    p.add_argument('--workers', type=int, default=8)
    p.add_argument('--compare', nargs=2)
    a = p.parse_args()
    if a.compare:
        raise SystemExit(compare(*a.compare))
    if a.output.exists():
        raise SystemExit(f'{a.output} exists')
    census(a.output, a.workers)
