#!/usr/bin/env python3
"""Write every importable graph's Kiln script to DIR and trace them all with 662-trace-type-check.mjs.

usage: 662-trace-type-check.py --output DIR [--workers N]
"""
import argparse, json, subprocess, sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
ROOT = TICKET.parents[4]
UPSTREAM = TICKET / 'sources/upstream'
sys.path.insert(0, str(ROOT / 'integrations/passnet'))


def one(graph):
    from corpus import translate_graph
    try:
        return graph, translate_graph(UPSTREAM, graph, 'fake')['script']
    except Exception:
        return graph, None


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--workers', type=int, default=8)
    a = p.parse_args()
    a.output.mkdir(parents=True)
    inventory = json.loads((TICKET / 'sources/evaluation-inventory.json').read_text())
    graphs = [g for s in inventory['samples'] for g in (UPSTREAM / s['sample'] / 'graph_list.txt').read_text().splitlines() if g.strip()]
    index = {}
    with ProcessPoolExecutor(a.workers) as pool:
        for i, (graph, script) in enumerate(pool.map(one, graphs, chunksize=8)):
            if script is not None:
                (a.output / f'{i:04d}.kiln.js').write_text(script); index[graph] = f'{i:04d}.kiln.js'
    (a.output / 'index.json').write_text(json.dumps(index, indent=1) + '\n')
    subprocess.run(['node', str(Path(__file__).with_name('662-trace-type-check.mjs')), str(a.output)], check=True)
