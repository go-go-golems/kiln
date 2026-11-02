#!/usr/bin/env python3
"""Freeze balanced policies after training-only traces and before any new GPU timing."""
import hashlib,json,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from propose_policy import propose_rich
s=p/'sources';corpus=s/'policy-corpus-v5-r1';manifest=json.loads((corpus/'manifest.json').read_text())
receipt=json.loads((s/'policy-artifacts-v5-r1-controls/default/compile-receipt.json').read_text())
controls=[json.loads((corpus/'policies'/(name+'.json')).read_text()) for name in ['baseline','default']]
proposal=propose_rich(manifest,receipt,controls)
with (corpus/'proposals.json').open('x') as out:out.write(json.dumps(proposal,indent=2)+'\n')
for policy in proposal['policies']:
 path=corpus/'policies'/(policy['id']+'.json')
 if policy['id'] in ['baseline','default']:
  assert json.loads(path.read_text())==policy
 else:
  with path.open('x') as out:out.write(json.dumps(policy,indent=2)+'\n')
plan={'format':'kiln-policy-measurement-plan/1','membership_sha256':manifest['membership_sha256'],'numerical_policy':manifest['numerical_policy'],
 'candidate_ids':[r['id'] for r in proposal['policies']],'seed':42,'warmup':20,'trials':100,'repeats':3,'max_iqr_fraction':0.2,'max_retries':2,
 'inputs':'Original source replay, exact metadata/output checks, dtype nominal tolerances and unchanged inputs',
 'order':'Seeded shuffle of distinct fingerprints; exact executable aliases share evidence',
 'metrics':['synchronized end-to-end ms','CUDA-event stream elapsed ms including dispatch gaps'],
 'selection':'Training-only family-balanced geometric mean end-to-end ratio to unchanged fixed-contract Kiln; exact ties retain declaration order with baseline first; compile-cost coefficient 0',
 'heldout':'Only baseline and committed training selection measured on eight fresh exact models; no timing-based replacement or filtering',
 'scope':manifest['scope'],'proposal_provenance':'Balanced grammar authored by Codex from training-only structural/fusion evidence; no external PassAgent/model invocation',
 'source_contract':'Separate elementary FP32 arithmetic across baseline and all candidates; native library/reduction equivalence still requires runtime checks'}
with (corpus/'measurement-plan.json').open('x') as out:out.write(json.dumps(plan,indent=2)+'\n')
paths=[corpus/'manifest.json',corpus/'reference-domains.json',corpus/'proposals.json',corpus/'measurement-plan.json',*sorted((corpus/'policies').glob('*.json'))]
frozen={'scope':'Candidate and procedure freeze before any confirmation IR compilation or new GPU timing','membership_sha256':manifest['membership_sha256'],'files_sha256':{str(path.relative_to(corpus)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}}
with (corpus/'candidate-freeze.json').open('x') as out:out.write(json.dumps(frozen,indent=2)+'\n')
print('FROZEN',len(proposal['policies']),'candidates;',proposal['cuts'],';',manifest['membership_sha256'])
