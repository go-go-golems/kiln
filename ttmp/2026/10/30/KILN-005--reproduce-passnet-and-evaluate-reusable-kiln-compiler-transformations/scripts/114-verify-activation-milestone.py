#!/usr/bin/env python3
"""Bind activation precision, provenance, import coverage and real-task evidence."""
import hashlib
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'sources'
read=lambda p:json.loads(p.read_text())
checks=0;max_errors={}
for receipt,fixtures in [('activation-cuda.json','activation-fixtures'),('activation-owned-cuda.json','activation-owned-fixtures')]:
 result=read(root/receipt)
 assert result['status']=='complete' and result['all_passed']
 assert {(r['dtype'],r['seed']) for r in result['records']}=={(d,s) for d in ['f32','f16','bf16'] for s in [1,7,42]}
 assert len(result['records'])==9
 for row in result['records']:
  assert row['status']=='passed'
  assert hashlib.sha256((root/fixtures/(row['dtype']+'.json')).read_bytes()).hexdigest()==row['artifact_sha256']
  max_errors[row['dtype']]=max(max_errors.get(row['dtype'],0),*row['output_max_abs_errors'])
 checks+=len(result['records'])
for source in read(root/'pytorch/activations/provenance.json')['records']:
 assert source['status']=='downloaded'
 assert hashlib.sha256((root/'pytorch/activations'/source['file']).read_bytes()).hexdigest()==source['sha256']
audit=read(root/'import-audit-after-functionalization-summary.json');coverage=read(root/'kiln-coverage.json')
assert (audit['tasks'],audit['graphs'],audit['graphs_imported'],len(audit['tasks_fully_imported']))==(200,2060,912,36)
assert (coverage['tasks_verified'],coverage['graphs_verified'])==(6,76)
real=coverage['records'][143];assert real['status']=='verified_modified_protocol' and real['verified_graphs']==3
assert all(r['numerical_correct_at_t1'] and r['matches']==1 for r in real['graph_results'].values())
score=read(root/'sixth-task-score.json');assert score['id']==144
facts={'cuda_dtype_seed_comparisons':checks,'max_output_abs_errors':max_errors,'graphs_imported':912,'complete_tasks_imported':36,'complete_tasks_verified':6,'graphs_verified':76,'new_task_index_zero_based':143,'new_task_variants':3,'new_task_score':score['score'],'new_task_protocols':real['protocols'],'limitations':['Import eligibility is not execution acceptance','SiLU uses existing Kiln decomposition; checks establish measured tolerance, not bitwise equivalence','Fresh single-use functionalization is conservative and does not implement general input mutation/alias writeback']}
(root/'activation-verified-facts.json').write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps(facts))
