"""Materialize the reviewed report into its docmgr reference and check publication inputs."""
import hashlib
import json
from pathlib import Path
import re

t=Path(__file__).resolve().parents[1]
body_path=t/'sources/project-reassessment-report-body.md'
report=t/'reference/22-project-reassessment-from-passnet-integration-to-reusable-compiler-optimization.md'
body=body_path.read_text()
assert body.startswith('# Kiln after PassNet integration:')
assert len(re.findall(r'^```',body,re.M))%2==0
assert len(re.findall(r'^```mermaid$',body,re.M))==2
assert len(re.findall(r'^## \d+\.',body,re.M))==16
assert '31 of 200' in body and '358 of 2,060' in body
assert '1.0537461946178859' in body
assert 'No controlled external-LLM experiment' in body
assert 'original full geometry' in body
front=report.read_text().split('---',2)
assert len(front)==3
report.write_text('---'+front[1]+'---\n\n'+body)
assert report.read_text().split('---',2)[2].strip()==body.strip()
facts=t/'sources/project-reassessment-facts-v1.json'
assert json.loads(facts.read_text())['coverage']['tasks_verified']==31
assert (t/'sources/kiln-meta-compiler-study.md').read_bytes()==Path('/home/manuel/Downloads/kiln_meta_compiler_study.md').read_bytes()
receipt={'format':'kiln-project-reassessment-report-review/1','body_sha256':hashlib.sha256(body.encode()).hexdigest(),
 'word_count':len(body.split()),'numbered_sections':16,'mermaid_figures':2,
 'facts_sha256':hashlib.sha256(facts.read_bytes()).hexdigest(),
 'scope':'Authored technical reassessment; structural checks and factual source audit do not substitute for editorial review or benchmark qualification.',
 'reviewed_inputs':'148 diary introductions/lessons, focused full failures, design series, implementation code, experiment summaries and new full-shape native evidence.'}
(t/'sources/project-reassessment-report-review-v1.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
