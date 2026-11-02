#!/usr/bin/env python3
"""Post-confirmation descriptive audit; no policy changes or new timing."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';corpus=s/'policy-corpus-v6';artifacts=s/'policy-artifacts-v6'
read=lambda path:json.loads(path.read_text())
manifest=read(corpus/'manifest.json');summary=read(s/'policy-measurements-v6/summary.json');chosen=summary['selected_policy']
receipts={name:read(artifacts/name/'compile-receipt.json') for name in ['baseline',chosen]};rows=[]
for result in summary['records']:
 index=next(i for i,row in enumerate(manifest['variants']) if row['graph']==result['graph']);row={'graph':result['graph'],'e2e_speedup':result['e2e_speedup'],'compiled':{}}
 for name,receipt in receipts.items():
  record=receipt['records'][index];artifact=read(artifacts/name/record['artifact'])
  row['compiled'][name]={'kernels':record['kernel_count'],'schedules':[kernel['row'] for kernel in artifact['kernels']],
                         'shapes':[kernel['shape'] for kernel in artifact['kernels']],
                         'accepted_fusions':sum(d['accepted'] for d in record['decisions']),
                         'rejected_fusions':[d for d in record['decisions'] if not d['accepted']]}
 rows.append(row)
output={'scope':'Post-confirmation descriptive diagnosis only; no altered selection, candidate tuning or new timing','selected_policy':chosen,'membership_sha256':manifest['membership_sha256'],'records':rows}
(s/'selective-confirmation-audit.json').write_text(json.dumps(output,indent=2)+'\n')
for row in rows:print(row['graph'],row['e2e_speedup'],{name:item['kernels'] for name,item in row['compiled'].items()})
