#!/usr/bin/env python3
"""Verify complete selective study and bind selection to its prior commitment."""
import hashlib,json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from summarize_policy import summarize
from qualify_policies import qualify
s=p/'sources';corpus=s/'policy-corpus-v6';artifacts=s/'policy-artifacts-v6';measurements=s/'policy-measurements-v6'
read=lambda path:json.loads(path.read_text())
manifest=read(corpus/'manifest.json');freeze=read(corpus/'candidate-freeze.json')
for name,digest in freeze['files_sha256'].items():
 if hashlib.sha256((corpus/name).read_bytes()).hexdigest()!=digest:raise ValueError('Frozen declaration changed: '+name)
if qualify(corpus,artifacts)!=read(artifacts/'sensitivity.json'):raise ValueError('Artifact qualification changed')
selection_path=measurements/'selection.json';commit='731e834'
if selection_path.read_bytes()!=subprocess.check_output(['git','show',commit+':'+str(selection_path.relative_to(repo))],cwd=repo):raise ValueError('Selection changed after commitment')
train=read(measurements/'train.json');heldout=read(measurements/'heldout.json');selection=read(selection_path)
for measured in [train,heldout]:
 if measured['backend_numerics']['float32_matmul_precision']!='highest' or measured['backend_numerics']['matmul_allow_tf32']:raise ValueError('Reference contract changed')
 if measured['plan']!=read(corpus/'measurement-plan.json'):raise ValueError('Measurement plan changed')
summary=summarize(manifest,train,selection,heldout)
receipt=read(artifacts/selection['selected_policy']/'compile-receipt.json')
partial=lambda split:sum(d.get('retainedProducer',False) and d['accepted'] and 0<d['selectedConsumerCount']<d['consumerCount'] for row in receipt['records'] if row['split']==split for d in row['decisions'])
summary.update(reference_protocol='Explicit highest-precision FP32 research protocol; not native PassBench acceptance',selection_commit=commit,
               selected_training_partial_fusions=partial('train'),selected_heldout_partial_fusions=partial('heldout'),
               source_verification_matches=read(s/'selective-remote-source-verification.json')['matches'])
summary['limitations']=[text for text in summary['limitations'] if not text.startswith('Profitability-policy selection preserves')]
summary['limitations'].append('The compiler now supports selective graph mutation, but the selected policy accepts no partial fusions on either observed split; it does not demonstrate a benefit from partial fusion or automatic discovery of a new rewrite.')
if not summary['source_verification_matches']:raise ValueError('Remote source mismatch')
(measurements/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='records'},indent=2))
