#!/usr/bin/env python3
"""Coverage from exact per-graph execution evidence, never operator guesses."""
from pathlib import Path
import json,re,sys
p=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(p/'sources/upstream'))
from pass_bench import analysis_util
inventory=json.loads((p/'sources/evaluation-inventory.json').read_text())
evidence={0:'first-task-isolated.log',1:'second-task-isolated.log',2:'third-task-isolated-v2.log',11:'fourth-task-canonical-priority-fixed.log',198:'fifth-task-isolated.log',143:'sixth-task-isolated.log',121:'seventh-task-original-evaluator.log'}
# Explicit ordered runs: only an evaluated log may supersede earlier evidence.
configurations={}
for run_name in ['matrix-cohort-v1','reference-domain-cohort-v1','separate-rounding-cohort-v1','softmax-cohort-v1','softmax-cohort-v2','softmax-cohort-v3','reshape-source-cohort-v1','gelu-source-cohort-v1','gelu-layernorm-cohort-v1','singleton-view-source-cohort-v1','avg-pooling-task-results-v1','adaptive-pooling-task-results-v1']:
    run_path=p/'sources'/run_name/'run.json'
    run=json.loads(run_path.read_text())
    if run['status']!='complete':raise ValueError('Coverage requires a terminal cohort')
    for case in run['records']:
        log=Path(run_name)/case['directory']/'benchmark.log'
        if (p/'sources'/log).exists():
            evidence[case['index']]=str(log)
            configurations[str(log)]={'contraction':run['plan'].get('contraction','allow'),'source_snapshot_sha256':run['source_snapshot']['sha256']}
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
        parsed=analysis_util.parse_single_sample_log_to_data('[Processing] /work/upstream/'+block)
        numeric,failure=analysis_util.check_sample_correctness(parsed,1)
        numeric=numeric and bool(parsed['correctness'].get('[equal]'))
        strict,strict_failure=analysis_util.check_sample_correctness(parsed,-5)
        strict=strict and bool(parsed['correctness'].get('[equal]'))
        observed[graph]={'success':block.count('[Result] status: success')==1 and '[Result] status: failed' not in block,'numerical_correct_at_t1':numeric,'numerical_failure':failure,'numerical_correct_at_tminus5':strict,'numerical_failure_at_tminus5':strict_failure,'matches':block.count('Applied 1 replacements')}
    verified=sum(v['success'] and v['numerical_correct_at_tminus5'] and v['matches']==1 for v in observed.values())
    complete=len(observed)==len(expected) and verified==len(expected)
    records.append({'task':sample['sample'],'graphs':len(expected),'status':'verified_modified_protocol' if complete else 'not_verified','verified_graphs':verified,'evidence':filename if observed else None,'graph_results':observed,'protocols':[name for name in ['kiln-normalized-fx/1','kiln-dispatch-record-stream/1','kiln-pattern-autowrap/1','kiln-pattern-multi-output/1'] if name in text] if observed else [],'compiler_configuration':configurations.get(filename) if observed else None,'limitations':['Unit-scale random stress input numerical mismatch remains unresolved; acceptance is for original benchmark replay'] if i==2 else []})
tasks=sum(r['status']=='verified_modified_protocol' for r in records)
graphs=sum(r['verified_graphs'] for r in records)
result={'numerical_acceptance_tolerance':-5,'protocol':'Modified integration; exact active extensions are recorded per task','coverage_scope':'Cumulative original replay evidence across recorded compiler snapshots; not a uniform full-corpus release evaluation','tasks_total':len(records),'graphs_total':sum(r['graphs'] for r in records),'tasks_verified':tasks,'graphs_verified':graphs,'graphs_in_complete_tasks':sum(r['graphs'] for r in records if r['status']=='verified_modified_protocol'),'tasks_remaining':len(records)-tasks,'records':records}
(p/'sources/kiln-coverage.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'Coverage: {tasks}/200 tasks, {graphs}/2060 graphs verified under declared modified protocol.')
