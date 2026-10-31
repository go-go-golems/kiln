"""Rank first import blockers by affected complete task families and graph variants."""

import collections
import json
import re
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
source = ticket / 'sources/scalar-layout-batch-import-v1.json'
output = ticket / 'sources/scalar-layout-batch-blocker-rank-v1.json'
records = json.loads(source.read_text())['records']
by_sample = collections.defaultdict(list)
for row in records:
    by_sample[row['sample']].append(row)


def category(row):
    error = row.get('error', '')
    if row['status'] == 'imported':
        return 'imported'
    patterns = [
        (r'nonfloating|non-float|only supported floating tensor inputs|int64|bool input', 'typed input'),
        (r'get_attr', 'captured tensor'),
        (r'inplace|in-place|mutation|alias', 'mutation/alias'),
        (r'unsupported target ([^;]+)', 'unsupported target'),
        (r'unsupported tensor method ([^;]+)', 'tensor method'),
        (r'unsupported node kind ([^;]+)', 'node kind'),
        (r'CUDA driver|NVIDIA driver', 'local driver'),
    ]
    for pattern, label in patterns:
        match = re.search(pattern, error, re.I)
        if match:
            return label + (': ' + match.group(1) if match.lastindex else '')
    return 'other: ' + error.splitlines()[0][:120]


summary = []
for sample, rows in by_sample.items():
    failed = [r for r in rows if r['status'] != 'imported']
    if not failed:
        continue
    groups = collections.Counter(category(r) for r in failed)
    summary.append({'sample': sample, 'graphs': len(rows), 'imported': len(rows) - len(failed),
                    'blocked': len(failed), 'first_blockers': dict(groups)})

blockers = collections.defaultdict(lambda: {'graphs': 0, 'tasks': set(), 'uniform_tasks': set()})
for row in summary:
    for kind, count in row['first_blockers'].items():
        blockers[kind]['graphs'] += count
        blockers[kind]['tasks'].add(row['sample'])
        if len(row['first_blockers']) == 1:
            blockers[kind]['uniform_tasks'].add(row['sample'])

ranked = [{'kind': kind, 'graphs': value['graphs'], 'tasks': len(value['tasks']),
           'uniform_first_blocker_tasks': len(value['uniform_tasks'])}
          for kind, value in blockers.items()]
ranked.sort(key=lambda row: (-row['uniform_first_blocker_tasks'], -row['graphs'], row['kind']))
result = {'format': 'kiln-import-blocker-rank/1', 'source': str(source.relative_to(ticket)),
          'imported_graphs': sum(r['status'] == 'imported' for r in records),
          'complete_tasks': len(by_sample) - len(summary), 'blocked_tasks': len(summary),
          'ranked_first_blockers': ranked, 'blocked_task_details': summary}
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ('imported_graphs', 'complete_tasks', 'blocked_tasks')}, indent=2))
for row in ranked[:25]:
    print(f"{row['uniform_first_blocker_tasks']:3} uniform-first-blocker tasks, "
          f"{row['graphs']:3} blocked graphs, {row['tasks']:3} affected tasks: {row['kind']}")
