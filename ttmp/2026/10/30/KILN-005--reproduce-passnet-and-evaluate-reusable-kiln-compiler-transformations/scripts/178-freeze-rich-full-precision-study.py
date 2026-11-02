#!/usr/bin/env python3
"""Declare an explicitly modified reference protocol; preserve the native failed study."""
import hashlib,json,shutil
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';old=s/'policy-corpus-v5-r1';new=s/'policy-corpus-v5-r2'
if new.exists():raise ValueError('Preserve prior declarations')
shutil.copytree(old,new)
plan=json.loads((new/'measurement-plan.json').read_text())
plan['reference_backend_numerics']={'float32_matmul_precision':'highest'}
plan['protocol_scope']='Modified full-precision FP32 compiler-policy experiment; not native PassBench acceptance'
plan['prior_evidence']='v5-r1 training observed; two native TF32-enabled baseline disagreements; no confirmation GPU timing observed'
(new/'measurement-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
freeze=json.loads((old/'candidate-freeze.json').read_text())
freeze['parent_freeze_sha256']=hashlib.sha256((old/'candidate-freeze.json').read_bytes()).hexdigest()
freeze['reference_protocol_change']=plan['reference_backend_numerics']
freeze['candidate_change']=False
freeze['prior_training_observed']=True
freeze['confirmation_gpu_feedback_observed']=False
for name in freeze['files_sha256']:freeze['files_sha256'][name]=hashlib.sha256((new/name).read_bytes()).hexdigest()
wrapper=p/'scripts/179-run-rich-full-precision.py'
freeze['execution_wrapper_sha256']=hashlib.sha256(wrapper.read_bytes()).hexdigest()
(new/'candidate-freeze.json').write_text(json.dumps(freeze,indent=2)+'\n')
print('Frozen unchanged source membership/candidates with explicitly modified FP32 reference',freeze['membership_sha256'])
