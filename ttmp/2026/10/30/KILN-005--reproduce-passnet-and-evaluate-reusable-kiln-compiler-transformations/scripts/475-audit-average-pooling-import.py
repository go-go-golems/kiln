"""Recheck every historical average-pooling first failure without dropping failures."""
import json,sys
from pathlib import Path
T=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(Path.cwd()/'integrations/passnet'))
from corpus import translate_graph
old=json.loads((T/'sources/import-audit-after-singleton-views.json').read_text())
out=T/'sources/avg-pooling-import-v1';out.mkdir()
rows=[]
for r in old['records']:
 if r['status']=='imported' or 'unsupported target torch._C._nn.avg_pool2d;' not in r.get('error',''):continue
 row={'graph':r['graph'],'sample':r['sample']}
 try:
  result=translate_graph(T/'sources/upstream',r['graph'],'fake')
  name=f'{len(rows):03d}.kiln.js';(out/name).write_text(result['script'])
  row.update(status='imported',script=name,inputs=result['inputs'],input_dtypes=result['input_dtypes'])
 except Exception as e:row.update(status='blocked',error=str(e),error_type=type(e).__name__)
 rows.append(row)
(out/'results.json').write_text(json.dumps({'scope':'Historical avg_pool2d first failures; import eligibility only.','records':rows},indent=2)+'\n')
print('imported',sum(r['status']=='imported' for r in rows),'of',len(rows))
for r in rows:
 if r['status']!='imported':print(r['error'])
