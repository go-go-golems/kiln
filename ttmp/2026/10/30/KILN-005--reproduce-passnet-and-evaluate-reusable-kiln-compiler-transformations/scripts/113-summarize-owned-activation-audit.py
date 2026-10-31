#!/usr/bin/env python3
"""Exact audit membership and first-blocker summary; not execution coverage."""
from collections import Counter,defaultdict
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]
x=json.loads((p/'sources/import-audit-after-functionalization.json').read_text())
inventory=json.loads((p/'sources/evaluation-inventory.json').read_text())
expected={s['sample']:(p/'sources/upstream'/s['sample']/'graph_list.txt').read_text().splitlines() for s in inventory['samples']}
tasks=defaultdict(list)
for r in x['records']:tasks[r['sample']].append(r)
assert set(tasks)==set(expected)
for task,records in tasks.items():
 assert len(records)==len(expected[task]) and {r['graph'] for r in records}==set(expected[task])
errors=Counter(r['error'].splitlines()[0].split(': ',1)[-1] for r in x['records'] if r['status']=='blocked')
result={'tasks':len(tasks),'graphs':len(x['records']),'graphs_imported':sum(r['status']=='imported' for r in x['records']),
 'tasks_fully_imported':[{'task':task,'graphs':len(records)} for task,records in tasks.items() if all(r['status']=='imported' for r in records)],
 'first_blockers':[{'diagnostic':e,'graphs':n} for e,n in errors.most_common()],
 'limitations':['Import success does not establish compilation, correctness or benchmark acceptance.','Only the first blocker per graph is counted.','Trusted source tracing may fail on local CUDA availability independently of semantic support.']}
(p/'sources/import-audit-after-functionalization-summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(result['graphs_imported'],'graphs across',len(result['tasks_fully_imported']),'fully importable tasks; not execution coverage')
