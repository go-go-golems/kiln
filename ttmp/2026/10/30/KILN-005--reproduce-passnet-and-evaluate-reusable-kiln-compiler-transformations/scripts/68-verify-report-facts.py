#!/usr/bin/env python3
"""Bounded verification of numerical facts in the milestone article."""
from pathlib import Path
import json
p=Path(__file__).resolve().parents[1];sources=p/'sources'
coverage=json.loads((sources/'kiln-coverage.json').read_text())
audit=json.loads((sources/'import-audit-summary.json').read_text())
assert (coverage['tasks_total'],coverage['graphs_total'])==(200,2060)
assert (coverage['tasks_verified'],coverage['graphs_verified'])==(5,73)
assert (audit['graphs_imported'],len(audit['tasks_fully_imported']))==(804,24)
paths=['first-task-score.json','second-task-score.json','third-task-score.json','fourth-task/score.json','fifth-task/score.json']
scores=[json.loads((sources/path).read_text())['score'] for path in paths]
expected=[0.8495327431059172,0.8227679072232458,0.043470409529710305,1.0032945157872568,0.8485481515793615]
assert scores==expected
verified=[r for r in coverage['records'] if r['status']=='verified_modified_protocol']
assert [r['graphs'] for r in verified]==[6,12,1,30,24]
assert 'all 24 passed' in (sources/'concat-probes-v2.log').read_text()
for name in ['f32','f16','bf16','mixed']:
 assert f'PASS concat-fixtures/{name}' in (sources/'concat-probes-v2.log').read_text()
receipt={'evidence_revision':'e98a315','coverage':{'tasks':5,'graphs':73},'import':{'tasks':24,'graphs':804},'scores':scores,'compiler_test_files_passed':24,'status':'verified'}
(sources/'project-report-facts.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
