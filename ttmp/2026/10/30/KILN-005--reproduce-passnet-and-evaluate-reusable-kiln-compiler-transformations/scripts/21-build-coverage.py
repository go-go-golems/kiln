#!/usr/bin/env python3
"""Coverage accounting; never infer execution support from operator names."""
from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]
inventory=json.loads((p/'sources/evaluation-inventory.json').read_text())
log=(p/'sources/first-task-isolated.log').read_text()
assert log.count('[Result] status: success')==6
assert log.count('Applied 1 replacements with KilnBatchNorm.')==6
assert '[Result] status: failed' not in log
records=[]
for i,sample in enumerate(inventory['samples']):
    records.append({'task':sample['sample'],'graphs':sample['graphs'],'status':'verified_modified_protocol' if i==0 else 'not_verified','verified_graphs':6 if i==0 else 0,'evidence':'first-task-isolated.log' if i==0 else None})
result={'protocol':'kiln-normalized-fx/1 + kiln-dispatch-record-stream/1','tasks_total':200,'graphs_total':2060,'tasks_verified':1,'graphs_verified':6,'tasks_remaining':199,'records':records}
(p/'sources/kiln-coverage.json').write_text(json.dumps(result,indent=2)+'\n')
print('Coverage: 1/200 tasks, 6/2060 graphs verified under declared modified protocol; 199 tasks not yet verified.')
