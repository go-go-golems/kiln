#!/usr/bin/env python3
"""Declare exact-model exclusions, sampling and fixed comparison before selection."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'integrations/passnet').exists());digest=lambda b:hashlib.sha256(b).hexdigest()
records={};provenance={}
for directory in sorted(s.glob('policy-corpus-v*')):
 manifest=directory/'manifest.json'
 if manifest.exists():
  provenance[str(manifest.relative_to(s))]=digest(manifest.read_bytes());rows=json.loads(manifest.read_text())['variants']
 else:
  audit=directory/'scan-audit.json'
  if not audit.exists():continue
  provenance[str(audit.relative_to(s))]=digest(audit.read_bytes());rows=[]
  for i,row in enumerate(r for r in json.loads(audit.read_text())['records'] if r['status']=='selected'):
   script=directory/f'{i:03d}.kiln.js';rows.append({'graph':row['graph'],'source_sha256':digest(script.read_bytes())})
 for row in rows:records[(row['graph'],row['source_sha256'])]={'graph':row['graph'],'source_sha256':row['source_sha256']}
excluded={'scope':'Every previously selected exact model/program in complete and partial policy studies; evaluation models are separately excluded by the selector','source_sha256':provenance,'variants':list(records.values())}
name='reshape-confirmation-prior-exclusions-v1.json'
with (s/name).open('x') as f:f.write(json.dumps(excluded,indent=2)+'\n')
spec={'format':'kiln-rich-study-selection/1','salt':'KILN-005-unit-axis-confirmation-v1','sample_list':'sample_lists/train/hf_fusible_train_samples_v2.txt','evaluation_list':'sample_lists/eval/hf_fusible_eval_samples_v2.txt','excluded_manifests':[name],'train_per_category':0,'heldout_per_category':10,'max_tasks':4476,'max_graphs_per_task':8,'max_input_elements':2000000,'max_tensor_elements':8000000,'max_total_tensor_elements':64000000,'max_tensor_nodes':128,'max_matrix_products':64000000,'contraction':'separate'}
with (s/'reshape-confirmation-selection-v1.json').open('x') as f:f.write(json.dumps(spec,indent=2)+'\n')
sources=s/'reshape-confirmation-compiler-sources-v1';sources.mkdir()
compiler_files={}
for role,revision in [('baseline','c15c610'),('candidate','fed37d1')]:
 raw=subprocess.check_output(['git','show',revision+':packages/kiln/src/std/tensor.js'],cwd=repo);filename=role+'-tensor.js';(sources/filename).write_bytes(raw)
 compiler_files[role]={'tensor_revision':revision,'relative_path':str((sources/filename).relative_to(s)),'sha256':digest(raw)}
plan={'format':'kiln-fixed-compiler-confirmation-declaration/1','scope':'Confirmation-only fixed compiler rewrite; metadata-restricted fresh exact model families, not architecture-disjoint and not native PassBench acceptance','selected_change_revision':'fed37d1','compiler_comparison':'Otherwise identical committed compiler/runtime/importer sources; only tensor.js is replaced by the pinned old/new bytes during isolated sequential compilation','compiler_variants':compiler_files,'selection_spec_sha256':digest((s/'reshape-confirmation-selection-v1.json').read_bytes()),'exclusion_sha256':digest((s/name).read_bytes()),'candidate_ids':['baseline','candidate'],'numerical_policy':{'contraction':'separate'},'reference_backend_numerics':{'float32_matmul_precision':'highest'},'dtype_tolerances':{'f32':{'rtol':1.3e-6,'atol':1e-5}},'target':'a100','seed':42,'warmup':20,'trials':100,'repeats':3,'max_iqr_fraction':0.2,'max_retries':2,'inputs':'Original source replay, no input mutation, complete output structure','order':'Seeded shuffled order of exact distinct executable fingerprints per graph/repeat; aliases share measurements','failure_policy':'Retain every selected graph and every compile/reference/correctness/timing failure; any failure disables an aggregate speedup claim; no replacement or outcome-based eligibility','selection':'No training, ranking or tuning; both source variants fixed before any selected graph is compiled','metrics':['synchronized end-to-end ms','CUDA-event stream elapsed ms including dispatch gaps'],'primary_summary':'Exact-model family-balanced geometric mean baseline/candidate median ratio; repeated timings are descriptive, not a calibrated confidence interval'}
with (s/'reshape-confirmation-declaration-v1.json').open('x') as f:f.write(json.dumps(plan,indent=2)+'\n')
print(len(records),'previously selected graph/source records excluded;',len(provenance),'prior complete/partial source audits')
