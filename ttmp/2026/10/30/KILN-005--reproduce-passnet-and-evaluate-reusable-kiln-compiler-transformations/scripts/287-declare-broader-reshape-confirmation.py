#!/usr/bin/env python3
"""Broaden only metadata memory bounds after incomplete selection, before compilation."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources'
if (s/'reshape-confirmation-v1/manifest.json').exists():raise ValueError('Expected preserved incomplete first scan')
scan=json.loads((s/'reshape-confirmation-v1/scan-audit.json').read_text());assert scan['tasks_scanned']==4476 and scan['category_counts']=={'reduction':9,'matrix':10}
spec=json.loads((s/'reshape-confirmation-selection-v1.json').read_text());spec.update(max_input_elements=8000000,max_tensor_elements=32000000,max_total_tensor_elements=128000000)
with (s/'reshape-confirmation-selection-v2.json').open('x') as f:f.write(json.dumps(spec,indent=2)+'\n')
plan=json.loads((s/'reshape-confirmation-declaration-v1.json').read_text());plan.update(selection_spec_sha256=hashlib.sha256((s/'reshape-confirmation-selection-v2.json').read_bytes()).hexdigest(),prior_selection_attempt={'directory':'reshape-confirmation-v1','scan_audit_sha256':hashlib.sha256((s/'reshape-confirmation-v1/scan-audit.json').read_bytes()).hexdigest(),'result':'Incomplete 19 of 20 metadata-selected families; no compilation, artifact inspection or GPU timing'},metadata_retry_policy='May reuse first-attempt metadata-only selections; these are not independent confirmations. All evaluation models and previously selected prior policy-study models remain excluded; fixed compiler sources and all measurement rules unchanged.')
with (s/'reshape-confirmation-declaration-v2.json').open('x') as f:f.write(json.dumps(plan,indent=2)+'\n')
print('Declared broader input/intermediate memory envelope; unchanged 10+10 quotas and compiler/measurement contract')
