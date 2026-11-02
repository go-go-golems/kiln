#!/usr/bin/env python3
"""Reimport all historical first failures targeted by the parallel operator batch."""
import collections,json,sys
from pathlib import Path
T=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(Path.cwd()/'integrations/passnet'))
from corpus import translate_graph
old=json.loads((T/'sources/import-audit-after-singleton-views.json').read_text())
planning=json.loads((T/'sources/parallel-port-batch-planning-v1.json').read_text())
errors=set(planning['errors'])
rows=[]
for prior in old['records']:
 if prior.get('error') not in errors:continue
 row={k:prior[k] for k in ('sample','graph')}
 try:
  result=translate_graph(T/'sources/upstream',row['graph'],'fake')
  row.update(status='imported',inputs=result['inputs'],input_dtypes=result['input_dtypes'])
 except Exception as e:row.update(status='blocked',error=str(e),error_type=type(e).__name__)
 rows.append(row)
family=collections.defaultdict(list)
for row in rows:family[row['sample']].append(row)
summary={'format':'kiln-parallel-port-import-audit/1','scope':'Historical first failures only; import does not establish GPU or benchmark acceptance','source_commit':'dc357ede74acf1a378c6bdadb45336a6f50d3a2a','graphs':len(rows),'imported':sum(r['status']=='imported' for r in rows),'families_touched':len(family),'families_imported_among_selected':sum(all(r['status']=='imported' for r in group) for group in family.values()),'remaining_errors':dict(collections.Counter(r['error'] for r in rows if r['status']!='imported')),'records':rows}
p=T/'sources/parallel-port-batch-import-v1.json';p.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='records'},indent=2))
