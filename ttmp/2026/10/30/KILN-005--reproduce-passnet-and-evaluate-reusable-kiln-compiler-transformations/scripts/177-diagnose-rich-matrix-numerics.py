#!/usr/bin/env python3
"""Diagnostic-only native precision contrasts; never used for policy selection."""
import argparse,json
from pathlib import Path
import torch
from corpus import load_module
from runtime import TorchProgram
from pass_bench.torch.test_compiler import get_input_dict

root=Path('/work');corpus=root/'policy-corpus-v5-r1';artifacts=root/'policy-artifacts-v5-r1/baseline'
manifest=json.loads((corpus/'manifest.json').read_text());receipt=json.loads((artifacts/'compile-receipt.json').read_text())
training=json.loads((root/'policy-measurements-v5-r1/train.json').read_text())
failed={r['graph'] for r in training['records'] if r['measurements'][r['bindings']['baseline']]['status']!='measured'}
result={'scope':'Diagnostic contrasts only; original failed training evidence and thresholds unchanged','torch_version':torch.__version__,'native_precision':torch.get_float32_matmul_precision(),'records':[]}
def flatten(value):
 if isinstance(value,torch.Tensor):return [value]
 if isinstance(value,dict):return [t for v in value.values() for t in flatten(v)]
 return [t for v in value for t in flatten(v)]
def compare(a,b):
 rows=[]
 for x,y in zip(flatten(a),flatten(b)):
  x=x.double();y=y.double();diff=(x-y).abs()
  rows.append({'max_abs':diff.max().item(),'mean_abs':diff.mean().item(),'not_close':int((~torch.isclose(x,y,rtol=1.3e-6,atol=1e-5,equal_nan=True)).sum()),'elements':x.numel()})
 return rows
for index,row in enumerate(manifest['variants']):
 if row['graph'] not in failed:continue
 source=root/'upstream'/row['graph'];torch.manual_seed(42)
 named=get_input_dict(argparse.Namespace(model_path=str(source),device='cuda'));inputs=[named[f'in_{i}'] for i in range(len(named))]
 model=load_module(source/'model.py').GraphModule()
 native=model(*inputs);exact=model(*(x.double() for x in inputs))
 prior=torch.get_float32_matmul_precision()
 try:
  torch.set_float32_matmul_precision('highest');highest=model(*inputs)
 finally:torch.set_float32_matmul_precision(prior)
 program=TorchProgram(artifacts/receipt['records'][index]['artifact'],include_paths=['/usr/local/cuda/include'])
 try:
  actual=program(*inputs)
  record={'graph':row['graph'],'compiled_vs_native':compare(actual,native),'compiled_vs_fp64':compare(actual,exact),'native_vs_fp64':compare(native,exact),'highest_vs_fp64':compare(highest,exact),'compiled_vs_highest':compare(actual,highest)}
  result['records'].append(record);print(json.dumps(record),flush=True)
 finally:program.close()
(root/'rich-matrix-numerics.json').write_text(json.dumps(result,indent=2)+'\n')
