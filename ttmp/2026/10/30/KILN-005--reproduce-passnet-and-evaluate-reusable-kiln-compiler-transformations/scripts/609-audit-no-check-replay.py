#!/usr/bin/env python3
"""Audit the seven-family diagnostic with PassBench's original log parser.

Run inside the pinned PassBench image after script 608 finishes. This script
labels every result as an internal-check-bypass diagnostic, not normal coverage.
"""

import argparse
import contextlib
import hashlib
import io
import json
import sys
from pathlib import Path


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--first-upstream', type=Path, required=True)
    parser.add_argument('--second-upstream', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    run = json.loads((root / 'run.json').read_text())
    if run['status'] != 'complete' or len(run['records']) != 7:
        raise ValueError('Diagnostic run is incomplete')

    sys.path.insert(0, str(args.first_upstream.resolve()))
    from pass_bench import analysis_util

    upstreams = {
        'parallel-port-qualification-v1': args.first_upstream.resolve(),
        'parallel-port-delta-qualification-v1': args.second_upstream.resolve(),
    }
    rows = []
    for task in run['records']:
        index = task['index']
        directory = root / 'results' / f'task-{index:03d}'
        upstream = upstreams[task['source_root']]
        manifest = json.loads((directory / 'corpus/manifest.json').read_text())
        expected = (upstream / task['sample'] / 'graph_list.txt').read_text().splitlines()
        if len(expected) != task['graphs_expected'] or [v['graph'] for v in manifest['variants']] != expected:
            raise ValueError(f'Task {index}: frozen membership changed')
        if any(sha256(directory / 'corpus' / script) != digest for script, digest in task['input_sha256'].items()):
            raise ValueError(f'Task {index}: compiled input changed')

        log = directory / 'benchmark.log'
        parsed = []
        if log.exists():
            with contextlib.redirect_stdout(io.StringIO()):
                parsed = analysis_util.parse_logs_to_data(str(log))
        observed = [r['model_path'].removeprefix('/work/upstream/') for r in parsed]
        if observed != expected[:len(observed)] or len(set(observed)) != len(observed):
            raise ValueError(f'Task {index}: unexpected or duplicate evaluated graph')
        blocks = log.read_text().split('graph-net-test-compiler-log [Processing] ')[1:] if log.exists() else []
        graphs = []
        for i, graph in enumerate(expected):
            if i >= len(parsed):
                graphs.append({'graph': graph, 'status': 'not_executed'})
                continue
            sample = parsed[i]
            matches = blocks[i].count('Applied 1 replacements')
            correct = bool(sample['correctness'].get('[equal]')) and analysis_util.check_sample_correctness(sample, -5)[0]
            execution_ok = (sample['status'] == 'correct' and
                            blocks[i].count('[Result] status: success') == 1 and
                            '[Result] status: failed' not in blocks[i])
            graphs.append({'graph': graph, 'execution_status': sample['status'],
                           'matches': matches, 'correct_at_minus_5': correct,
                           'execution_ok': execution_ok,
                           'externally_accepted': execution_ok and matches == 1 and correct})
        score = json.loads((directory / 'score.json').read_text()) if (directory / 'score.json').exists() else None
        rows.append({'index': index, 'source_root': task['source_root'],
                     'process_status': task['status'], 'graph_count': len(expected),
                     'graphs_executed': len(parsed), 'externally_complete': len(parsed) == len(expected),
                     'externally_accepted': len(parsed) == len(expected) and all(g.get('externally_accepted', False) for g in graphs),
                     'score': score, 'benchmark_log_sha256': sha256(log) if log.exists() else None,
                     'graphs': graphs})
    result = {'format': 'kiln-reference-bypass-audit/1',
              'scope': 'Internal Kiln export check bypassed; declared FX argument normalization plus original PassBench numerical and scoring checks; excluded from ordinary coverage',
              'tasks': len(rows), 'graphs': sum(r['graph_count'] for r in rows),
              'externally_complete_tasks': sum(r['externally_complete'] for r in rows),
              'externally_accepted_tasks': sum(r['externally_accepted'] for r in rows),
              'externally_accepted_graphs': sum(g.get('externally_accepted', False) for r in rows for g in r['graphs']),
              'records': rows}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'records'}))


if __name__ == '__main__':
    main()
