#!/usr/bin/env python3
"""Verify that known source-name-only contrasts become exact artifact aliases."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';directory=s/'canonicalization-v7-replay';audit=json.loads((s/'region-training-cuda-renaming-audit.json').read_text())
read=lambda path:json.loads(path.read_text())
receipts={name:read(directory/name/'compile-receipt.json') for name in ['baseline','region-work']}
expected=[r['graph'] for r in audit['records']]
for receipt in receipts.values():
 if receipt['phase']!='train' or [r['graph'] for r in receipt['records']]!=expected or any(r['status']!='compiled' for r in receipt['records']):raise ValueError('Incomplete training replay')
rows=[]
for index,prior in enumerate(audit['records']):
 old=prior['bindings'];name_only=old['baseline']['exact_fingerprint']!=old['region-work']['exact_fingerprint'] and old['baseline']['normalized_cuda_signature']==old['region-work']['normalized_cuda_signature']
 artifacts={name:read(directory/name/receipt['records'][index]['artifact']) for name,receipt in receipts.items()}
 for name,artifact in artifacts.items():
  if artifact['codegen']!='kiln-codegen/3':raise ValueError('Expected new codegen boundary')
  if receipts[name]['records'][index]['kernel_identities']!=old[name]['kernel_identities']:raise ValueError('Canonical naming changed mathematical kernel identities')
  # Hash exactly the same data as compile_policy, without any regex/name rewriting.
  executable={k:v for k,v in artifact.items() if k not in ['name','source','compiler_policy']}
  digest=hashlib.sha256(json.dumps(executable,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
  if digest!=receipts[name]['records'][index]['fingerprint']:raise ValueError('Exact exported fingerprint mismatch')
 equal=receipts['baseline']['records'][index]['fingerprint']==receipts['region-work']['records'][index]['fingerprint']
 if name_only and not equal:raise ValueError('Known generated-name contrast remains distinct')
 rows.append({'graph':prior['graph'],'previous_name_only_contrast':name_only,'exact_alias_after_canonicalization':equal})
result={'scope':'Observed training-only validation; no old measurements/ranking changed, no new timing or confirmation use',
        'codegen':'kiln-codegen/3','training_graphs':len(rows),'known_name_only_contrasts':sum(r['previous_name_only_contrast'] for r in rows),
        'resolved_name_only_contrasts':sum(r['previous_name_only_contrast'] and r['exact_alias_after_canonicalization'] for r in rows),
        'previous_exact_aliases':sum(r['bindings']['baseline']['exact_fingerprint']==r['bindings']['region-work']['exact_fingerprint'] for r in audit['records']),
        'exact_aliases_after':sum(r['exact_alias_after_canonicalization'] for r in rows),
        'still_distinct_pairs':sum(not r['exact_alias_after_canonicalization'] for r in rows),'records':rows}
if result['known_name_only_contrasts']!=8:raise ValueError('Unexpected diagnostic population')
(s/'canonicalization-v7-replay-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='records'},indent=2))
