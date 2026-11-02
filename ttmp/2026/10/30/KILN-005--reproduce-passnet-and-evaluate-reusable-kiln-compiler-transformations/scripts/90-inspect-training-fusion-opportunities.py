#!/usr/bin/env python3
"""Export training-only structural opportunity evidence for the next synthesis study."""
from collections import Counter
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
receipt=json.loads((root/'sources/policy-artifacts-v3/default/compile-receipt.json').read_text())
rows=[r for r in receipt['records'] if r['split']=='train']
result={'scope':'Training-only default traces; no held-out decisions or timings used','graphs':len(rows),'kernel_count_histogram':dict(Counter(r['kernel_count'] for r in rows)),'accepted':sum(d['accepted'] for r in rows for d in r['decisions']),'rejected':sum(not d['accepted'] for r in rows for d in r['decisions']),'records':[{'graph':r['graph'],'kernel_count':r['kernel_count'],'decisions':r['decisions']} for r in rows]}
(root/'sources/policy-measurements-v2/training-opportunities.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='records'}))
