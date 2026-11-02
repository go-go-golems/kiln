"""Count executable diversity before assigning GPU time; no speedup inference."""
import json
from pathlib import Path
T=Path(__file__).resolve().parent.parent
root=T/'sources/pi-transformation-artifacts-v1'
receipt=json.loads((root/'study-compile-receipt.json').read_text())
assert receipt['status'] in ['qualified','qualified_with_candidate_failures']
read=lambda name:json.loads((root/name/'compile-receipt.json').read_text())['records']
fixed={r['graph']:r for r in read('staged-fusion') if r['split']=='train'}
seen={g:{r['fingerprint']} for g,r in fixed.items()}
rows=[]
for entry in receipt['records']:
 name=entry['policy'];records=[r for r in read(name) if r['split']=='train']
 novel=0
 for r in records:
  if r['status']=='compiled' and r['fingerprint'] not in seen[r['graph']]:
   novel+=1;seen[r['graph']].add(r['fingerprint'])
 rows.append({'policy':name,'training_graphs':len(records),
  'compile_failures':sum(r['status']!='compiled' for r in records),
  'different_from_fixed':sum(r.get('fingerprint')!=fixed[r['graph']]['fingerprint'] for r in records),
  'new_executables_in_order':novel,
  'compile_ms':sum(r['compile_ms'] for r in records)})
result={'status':receipt['status'],'records':rows,'interpretation':'Fingerprint diversity only; performance requires GPU measurement.'}
(T/'sources/pi-transformation-compilation-analysis-v1.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
