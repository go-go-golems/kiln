#!/usr/bin/env python3
"""Bind final research facts to frozen sources, exact artifacts and committed selection."""
import hashlib,json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from summarize_policy import summarize
from qualify_policies import qualify
s=p/'sources';corpus=s/'policy-corpus-v5-r2';artifacts=s/'policy-artifacts-v5-r1';measurements=s/'policy-measurements-v5-r2'
read=lambda path:json.loads(path.read_text())
manifest=read(corpus/'manifest.json');freeze=read(corpus/'candidate-freeze.json')
for name,digest in freeze['files_sha256'].items():
 if hashlib.sha256((corpus/name).read_bytes()).hexdigest()!=digest:raise ValueError('Frozen declaration changed: '+name)
if qualify(corpus,artifacts)!=read(artifacts/'sensitivity.json'):raise ValueError('Artifact qualification changed')
selection_path=measurements/'selection.json'
committed=subprocess.check_output(['git','show','2a4162c:'+str(selection_path.relative_to(repo))],cwd=repo)
if selection_path.read_bytes()!=committed:raise ValueError('Selection differs from pre-confirmation commitment')
train=read(measurements/'train.json');heldout=read(measurements/'heldout.json');selection=read(selection_path)
for observed in [train,heldout]:
 if observed['backend_numerics']['float32_matmul_precision']!='highest' or observed['backend_numerics']['matmul_allow_tf32']:raise ValueError('Reference protocol changed')
 if observed['plan']!=read(corpus/'measurement-plan.json'):raise ValueError('Measurement plan changed')
summary=summarize(manifest,train,selection,heldout)
summary['reference_protocol']='Explicit highest-precision FP32 reference; modified research protocol, not native PassBench acceptance'
summary['selection_commit']='2a4162c'
summary['native_study_status']='Completed training with two baseline correctness failures; no eligible selection'
summary['source_verification_matches']=read(s/'rich-remote-source-verification.json')['matches']
if not summary['source_verification_matches']:raise ValueError('Remote source mismatch')
(measurements/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='records'},indent=2))
