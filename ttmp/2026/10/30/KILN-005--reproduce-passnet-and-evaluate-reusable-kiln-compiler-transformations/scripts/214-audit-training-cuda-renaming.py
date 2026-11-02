#!/usr/bin/env python3
"""Training-only diagnostic of exact CUDA bodies modulo generated reduction names.

No aliases, selection rule or measurements are changed by this descriptive audit.
"""
import copy,hashlib,json,re
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';corpus=s/'policy-corpus-v7';artifacts=s/'policy-artifacts-v7'
manifest=json.loads((corpus/'manifest.json').read_text());plan=json.loads((corpus/'measurement-plan.json').read_text())
receipts={name:json.loads((artifacts/name/'compile-receipt.json').read_text()) for name in plan['candidate_ids']}
def signature(artifact):
 value=copy.deepcopy(artifact)
 for key in ['name','source','compiler_policy']:value.pop(key,None)
 for kernel in value['kernels']:
  code=re.sub(r'\b'+re.escape(kernel['name'])+r'\b','kernel_entry',kernel['cuda']);names={}
  def rename(match):return names.setdefault(match.group(),f'reduction_index_{len(names)}')
  kernel['cuda']=re.sub(r'\br\d+(?:_\d+)*\b',rename,code)
  for key in ['name','identity','wgsl','wgslUnavailable']:kernel.pop(key,None)
 return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
rows=[]
for index,record in enumerate(manifest['variants']):
 if record['split']!='train':continue
 row={'graph':record['graph'],'bindings':{}}
 for name,receipt in receipts.items():
  compiled=receipt['records'][index];artifact=json.loads((artifacts/name/compiled['artifact']).read_text())
  row['bindings'][name]={'exact_fingerprint':compiled['fingerprint'],'normalized_cuda_signature':signature(artifact),'kernel_identities':compiled['kernel_identities']}
 rows.append(row)
counts={name:sum(row['bindings'][name]['exact_fingerprint']!=row['bindings']['baseline']['exact_fingerprint'] and row['bindings'][name]['normalized_cuda_signature']==row['bindings']['baseline']['normalized_cuda_signature'] for row in rows) for name in receipts}
equal_ids={name:sum(row['bindings'][name]['exact_fingerprint']!=row['bindings']['baseline']['exact_fingerprint'] and row['bindings'][name]['normalized_cuda_signature']==row['bindings']['baseline']['normalized_cuda_signature'] and row['bindings'][name]['kernel_identities']==row['bindings']['baseline']['kernel_identities'] for row in rows) for name in receipts}
result={'scope':'Training-only descriptive CUDA renaming audit; no timing/confirmation inspection, no changed measurement aliases or selection','normalization':'Only kernel entry symbol and generated r-number reduction identifiers; CUDA ABI/buffers/dispatch/source otherwise retained','exact_changes_equal_after_normalization':counts,'normalized_matches_with_equal_kernel_identities':equal_ids,'records':rows}
(s/'region-training-cuda-renaming-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(counts,indent=2))
