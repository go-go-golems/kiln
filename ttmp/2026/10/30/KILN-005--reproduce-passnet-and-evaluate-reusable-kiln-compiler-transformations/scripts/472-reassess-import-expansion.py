"""Rank historical first-failure diagnostics and recheck pooling against current code."""
from collections import Counter
import json
from pathlib import Path
import sys
T=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(Path.cwd()/'integrations/passnet'))
from corpus import translate_graph
old=json.loads((T/'sources/import-audit-after-singleton-views.json').read_text())
blocked=[r for r in old['records'] if r['status']!='imported']
counts=Counter(r['error'].split(': ',1)[-1] for r in blocked)
probes=[]
for op in ['max_pool2d','avg_pool2d','adaptive_avg_pool2d']:
 row=next(r for r in blocked if 'unsupported target' in r['error'] and ('.'+op+';') in r['error'] and '/float32/' in r['graph'])
 try:
  translate_graph(T/'sources/upstream',row['graph'],'fake')
  result={'status':'imported'}
 except Exception as e:result={'status':'blocked','error':str(e),'error_type':type(e).__name__}
 probes.append({'operator':op,'graph':row['graph'],'sample':row['sample'],**result})
result={'scope':'Historical first-failure counts, not unlocked-graph predictions. Three FP32 representatives rechecked with current importer.',
 'historical_imported':sum(r['status']=='imported' for r in old['records']),
 'first_failure_counts':counts.most_common(), 'current_probes':probes}
(T/'sources/import-expansion-priority-v1.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'top_diagnostics':counts.most_common(10),'current_probes':probes},indent=2))
