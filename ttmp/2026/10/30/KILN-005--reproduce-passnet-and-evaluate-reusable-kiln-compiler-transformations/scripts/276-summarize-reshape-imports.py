#!/usr/bin/env python3
"""Summarize complete original evaluation membership without acceptance claims."""
import collections,json
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'sources';d=json.loads((p/'import-audit-after-reshape.json').read_text());groups=collections.defaultdict(list)
for row in d['records']:groups[row['sample']].append(row)
full=[{'task':s,'graphs':len(rows)} for s,rows in groups.items() if all(r['status']=='imported' for r in rows)]
summary={'tasks':len(groups),'graphs':len(d['records']),'graphs_imported':sum(r['status']=='imported' for r in d['records']),'tasks_fully_imported':full,'scope':'Import eligibility only; not original benchmark acceptance'}
(p/'import-audit-after-reshape-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(summary['graphs_imported'],len(full))
