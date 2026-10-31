#!/usr/bin/env python3
"""Coverage from exact per-graph execution evidence, never operator guesses."""
from pathlib import Path
import json,re
p=Path(__file__).resolve().parents[1]
inventory=json.loads((p/'sources/evaluation-inventory.json').read_text())
evidence={0:'first-task-isolated.log',1:'second-task-isolated.log',2:'third-task-isolated-v2.log',11:'fourth-task-isolated-v4.log',198:'fifth-task-isolated.log'}
records=[]
for i,sample in enumerate(inventory['samples']):
    expected=(p/'sources/upstream'/sample['sample']/'graph_list.txt').read_text().splitlines()
    filename=evidence.get(i)
    path=p/'sources'/filename if filename else None
    text=path.read_text() if path and path.exists() else ''
    blocks=re.split(r'graph-net-test-compiler-log \[Processing\] /work/upstream/',text)[1:]
    observed={}
    for block in blocks:
        graph=block.splitlines()[0].strip()
        if graph not in expected: raise ValueError(f'Unexpected graph: {graph}')
        if graph in observed: raise ValueError(f'Duplicate graph execution: {graph}')
        observed[graph]={'success':block.count('[Result] status: success')==1 and '[Result] status: failed' not in block,'matches':block.count('Applied 1 replacements')}
    verified=sum(v['success'] and v['matches']==1 for v in observed.values())
    complete=len(observed)==len(expected) and verified==len(expected)
    records.append({'task':sample['sample'],'graphs':len(expected),'status':'verified_modified_protocol' if complete else 'not_verified','verified_graphs':verified,'evidence':filename if observed else None,'graph_results':observed,'protocols':(['kiln-normalized-fx/1','kiln-dispatch-record-stream/1']+(['kiln-pattern-autowrap/1','kiln-pattern-multi-output/1'] if i in (11,198) else [])) if observed else [],'limitations':['Unit-scale random stress input numerical mismatch remains unresolved; acceptance is for original benchmark replay'] if i==2 else []})
tasks=sum(r['status']=='verified_modified_protocol' for r in records)
graphs=sum(r['verified_graphs'] for r in records)
result={'protocol':'kiln-normalized-fx/1 + kiln-dispatch-record-stream/1','tasks_total':len(records),'graphs_total':sum(r['graphs'] for r in records),'tasks_verified':tasks,'graphs_verified':graphs,'tasks_remaining':len(records)-tasks,'records':records}
(p/'sources/kiln-coverage.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Coverage: {tasks}/200 tasks, {graphs}/2060 graphs verified under declared modified protocol.')
