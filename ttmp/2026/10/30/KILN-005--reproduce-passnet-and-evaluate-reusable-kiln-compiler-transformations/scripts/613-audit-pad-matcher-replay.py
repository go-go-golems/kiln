#!/usr/bin/env python3
"""Summarize the already-completed two-task mixed-snapshot matcher diagnostic."""
import contextlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, '/work/upstream')
from pass_bench import analysis_util

root = Path('/work')
rows = []
for index, expected in [(110, 21), (146, 4)]:
    case = root / 'results' / f'task-{index}'
    log = case / 'benchmark.log'
    with contextlib.redirect_stdout(io.StringIO()):
        parsed = analysis_util.parse_logs_to_data(str(log))
    blocks = log.read_text().split('graph-net-test-compiler-log [Processing] ')[1:]
    graphs = []
    for i, sample in enumerate(parsed):
        matches = blocks[i].count('Applied 1 replacements')
        numerical = bool(sample['correctness'].get('[equal]')) and analysis_util.check_sample_correctness(sample, -5)[0]
        execution = sample['status'] == 'correct' and blocks[i].count('[Result] status: success') == 1
        graphs.append({'graph': sample['model_path'], 'matches': matches,
                       'correct_at_minus_5': numerical, 'execution_ok': execution,
                       'accepted': matches == 1 and numerical and execution})
    rows.append({'index': index, 'expected': expected, 'observed': len(parsed),
                 'accepted': sum(g['accepted'] for g in graphs),
                 'score': json.loads((case / 'score.json').read_text()), 'graphs': graphs})
result = {'format': 'kiln-mixed-snapshot-pad-matcher-audit/1',
          'scope': 'Previously compiled --no-check artifacts with newer FX normalizer; original PassBench numerical and scoring checks; not normal coverage',
          'rows': rows}
(root / 'audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps([{k: v for k, v in r.items() if k != 'graphs'} for r in rows]))
