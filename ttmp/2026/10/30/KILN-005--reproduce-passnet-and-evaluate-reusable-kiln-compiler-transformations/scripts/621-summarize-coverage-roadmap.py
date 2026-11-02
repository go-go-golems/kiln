"""Summarize current import eligibility against the cumulative acceptance ledger."""
import collections
import json
from pathlib import Path

ticket = Path(__file__).resolve().parent.parent
sources = ticket / 'sources'
audit = json.loads((sources / 'coverage-roadmap-import-audit-v1.json').read_text())
coverage = json.loads((sources / 'kiln-coverage.json').read_text())
by_sample = collections.defaultdict(list)
for row in audit['records']:
    by_sample[row['sample']].append(row)
complete = {sample: rows for sample, rows in by_sample.items() if all(row['status'] == 'imported' for row in rows)}
verified = {row['task'] for row in coverage['records'] if row['status'] == 'verified_modified_protocol'}
pending = sorted([{'sample': sample, 'graphs': len(rows)} for sample, rows in complete.items() if sample not in verified],
                 key=lambda row: (-row['graphs'], row['sample']))
errors = collections.Counter(row.get('error', 'unknown') for row in audit['records'] if row['status'] != 'imported')
result = {'format': 'kiln-coverage-roadmap-census/1',
          'scope': 'Current-source CPU fake-metadata import census; historical cumulative external acceptance ledger',
          'tasks': len(by_sample), 'graphs': len(audit['records']),
          'graphs_imported': sum(row['status'] == 'imported' for row in audit['records']),
          'tasks_fully_imported': len(complete),
          'tasks_verified_cumulative': len(verified),
          'verified_tasks_still_importable': len(verified & complete.keys()),
          'fully_importable_unverified_tasks': len(pending),
          'fully_importable_unverified_graphs': sum(row['graphs'] for row in pending),
          'top_two_pending_graphs': sum(row['graphs'] for row in pending[:2]),
          'first_error_counts': dict(errors),
          'pending_tasks': pending}
(sources / 'coverage-roadmap-census-v1.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key not in ('first_error_counts', 'pending_tasks')}, indent=2))
