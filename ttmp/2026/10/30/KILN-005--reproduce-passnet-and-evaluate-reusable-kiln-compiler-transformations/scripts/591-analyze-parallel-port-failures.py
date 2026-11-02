"""Classify the first 16-family replay by matching, correctness and compile stage."""
import collections,json,re
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';audit=json.loads((s/'parallel-port-task-audit-v1.json').read_text());root=s/'parallel-port-task-results-v1'
rows=[]
for task in audit['records']:
 index=task['index'];directory=root/f'task-{index:03d}'
 counts=dict(collections.Counter(g.get('execution_status') or 'unexecuted' for g in task['graphs']))
 failed=[]
 for file in sorted((directory/'corpus').glob('*.kiln.compile.log')):
  text=file.read_text()
  if 'FAILED' in text or 'Error' in text:failed.append({'file':file.name,'tail':text[-350:]})
 benchmark=(directory/'benchmark.log').read_text() if (directory/'benchmark.log').exists() else ''
 rows.append({'index':index,'graphs':task['graph_count'],'accepted':task['nominal_accepted'],'statuses':counts,'no_pass_match_count':benchmark.count('No passes modified the graph.'),'compile_failures':failed[:3]})
result={'format':'kiln-parallel-port-failure-taxonomy/1','scope':'First 16-family complete-task replay; process and per-graph evidence retained separately','tasks_accepted':sum(r['accepted'] for r in rows),'graphs_accepted':sum(r['graphs'] for r in rows if r['accepted']),'statuses':dict(collections.Counter(k for r in rows for k in r['statuses'] for _ in range(r['statuses'][k]))),'records':rows}
(s/'parallel-port-failure-taxonomy-v1.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='records'},indent=2))
