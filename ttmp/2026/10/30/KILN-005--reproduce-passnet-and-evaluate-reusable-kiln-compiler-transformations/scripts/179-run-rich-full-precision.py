#!/usr/bin/env python3
"""Explicit research reference protocol, separate from native PassBench evaluation."""
import hashlib,json,sys
from pathlib import Path
import torch
import measure_policy

args=sys.argv[1:]
corpus=Path(args[args.index('--corpus')+1])
plan=json.loads((corpus/'measurement-plan.json').read_text())
freeze=json.loads((corpus/'candidate-freeze.json').read_text())
if plan['reference_backend_numerics']!={'float32_matmul_precision':'highest'}:raise ValueError('Unexpected reference protocol')
if hashlib.sha256(Path(__file__).read_bytes()).hexdigest()!=freeze['execution_wrapper_sha256']:raise ValueError('Frozen execution wrapper changed')
for name,digest in freeze['files_sha256'].items():
 if hashlib.sha256((corpus/name).read_bytes()).hexdigest()!=digest:raise ValueError('Study declaration changed: '+name)
prior=torch.get_float32_matmul_precision()
try:
 torch.set_float32_matmul_precision('highest')
 if torch.get_float32_matmul_precision()!='highest' or torch.backends.cuda.matmul.allow_tf32:raise ValueError('Full-precision reference contract unavailable')
 print('MODIFIED REFERENCE PROTOCOL: float32_matmul_precision=highest; native PassBench results unchanged',flush=True)
 measure_policy.main()
finally:torch.set_float32_matmul_precision(prior)
