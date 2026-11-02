#!/usr/bin/env python3
"""Freeze selective policies from training traces before confirmation compilation."""
import hashlib,json,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from propose_policy import propose_selective
s=p/'sources';corpus=s/'policy-corpus-v6';manifest=json.loads((corpus/'manifest.json').read_text())
receipt=json.loads((s/'policy-artifacts-v6-controls/default/compile-receipt.json').read_text())
controls=[json.loads((corpus/'policies'/(name+'.json')).read_text()) for name in ['baseline','default']]
proposals=propose_selective(manifest,receipt,controls)
with (corpus/'proposals.json').open('x') as f:f.write(json.dumps(proposals,indent=2)+'\n')
for policy in proposals['policies'][2:]:
 with (corpus/'policies'/(policy['id']+'.json')).open('x') as f:f.write(json.dumps(policy,indent=2)+'\n')
plan={'format':'kiln-policy-measurement-plan/1','membership_sha256':manifest['membership_sha256'],'numerical_policy':manifest['numerical_policy'],
 'reference_backend_numerics':{'float32_matmul_precision':'highest'},'protocol_scope':'Modified full-precision FP32 compiler-policy research; not native PassBench acceptance',
 'candidate_ids':[r['id'] for r in proposals['policies']],'seed':42,'warmup':20,'trials':100,'repeats':3,'max_iqr_fraction':0.2,'max_retries':2,
 'inputs':'Original source replay, unchanged nominal dtype tolerances, output structure and input immutability checks',
 'order':'Seeded shuffle of distinct fingerprints; exact executable aliases share evidence',
 'metrics':['synchronized end-to-end ms','CUDA-event stream elapsed ms including dispatch gaps'],
 'selection':'Training-only family-balanced geometric mean end-to-end ratio to unchanged Kiln; exact ties preserve declaration order; compile-cost coefficient zero',
 'heldout':'Only baseline and committed training selection; all eight fresh exact models retained without filtering or replacement',
 'scope':manifest['scope'],'proposal_provenance':proposals['policies'][2]['provenance'],
 'source_contract':'Separate elementary FP32 arithmetic and explicitly full-precision native matrix reference, fixed across all policies'}
with (corpus/'measurement-plan.json').open('x') as f:f.write(json.dumps(plan,indent=2)+'\n')
paths=[corpus/'manifest.json',corpus/'reference-domains.json',corpus/'proposals.json',corpus/'measurement-plan.json',*sorted((corpus/'policies').glob('*.json'))]
freeze={'scope':'Before confirmation IR compilation or GPU timing; training structural controls only','membership_sha256':manifest['membership_sha256'],
 'files_sha256':{str(path.relative_to(corpus)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
 'execution_wrapper_sha256':hashlib.sha256((p/'scripts/179-run-rich-full-precision.py').read_bytes()).hexdigest()}
with (corpus/'candidate-freeze.json').open('x') as f:f.write(json.dumps(freeze,indent=2)+'\n')
print('FROZEN',len(proposals['policies']),'programs;',proposals['training_multiple_consumer_decisions'],'training fanout decisions;',manifest['membership_sha256'])
