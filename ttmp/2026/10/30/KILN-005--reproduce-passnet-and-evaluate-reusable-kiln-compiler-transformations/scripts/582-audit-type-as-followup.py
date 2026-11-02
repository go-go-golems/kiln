#!/usr/bin/env python3
"""Reimport every graph in all 24 touched PassBench families."""
import collections,json,sys
from pathlib import Path
T=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(Path.cwd()/'integrations/passnet'))
from corpus import translate_graph
prior=json.loads((T/'sources/parallel-port-batch-import-v1.json').read_text())
samples=sorted({r['sample'] for r in prior['records']})
rows=[]
for sample in samples:
 paths=(T/'sources/upstream'/sample/'graph_list.txt').read_text().splitlines()
 group=[]
 for graph in paths:
  try:
   result=translate_graph(T/'sources/upstream',graph,'fake')
   group.append({'graph':graph,'status':'imported','inputs':result['inputs'],'input_dtypes':result['input_dtypes']})
  except Exception as e:group.append({'graph':graph,'status':'blocked','error':str(e)})
 rows.append({'sample':sample,'count':len(group),'imported':sum(r['status']=='imported' for r in group),'complete':all(r['status']=='imported' for r in group),'graphs':group})
result={'format':'kiln-parallel-port-family-import-audit/3','scope':'All graph_list members in 24 touched task families; import only','families':len(rows),'families_imported':sum(r['complete'] for r in rows),'graphs':sum(r['count'] for r in rows),'graphs_imported':sum(r['imported'] for r in rows),'remaining_errors':dict(collections.Counter(g['error'] for r in rows for g in r['graphs'] if g['status']=='blocked')),'records':rows}
(T/'sources/parallel-port-family-import-v3.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='records'},indent=2))
