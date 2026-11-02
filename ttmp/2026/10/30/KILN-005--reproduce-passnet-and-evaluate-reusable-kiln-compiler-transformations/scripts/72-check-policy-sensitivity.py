#!/usr/bin/env python3
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--corpus',type=Path,required=True);p.add_argument('--artifacts',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
m=json.loads((a.corpus/'manifest.json').read_text());baseline=json.loads((a.artifacts/'baseline/compile-receipt.json').read_text())
assert [r['graph'] for r in baseline['records']]==[r['graph'] for r in m['variants']]
changes={};artifact_hashes={};semantic_hashes={}
for name in ['baseline','disabled','strict','default','relaxed125','relaxed2']:
 x=json.loads((a.artifacts/name/'compile-receipt.json').read_text())
 assert x['membership_sha256']==m['membership_sha256'] and x['reference_domain_sha256']==baseline['reference_domain_sha256']
 assert len(x['records'])==len(m['variants'])
 assert all(r['status']=='compiled' for r in x['records'])
 assert [r['graph'] for r in x['records']]==[r['graph'] for r in baseline['records']]
 artifact_hashes[name]=[];semantic_hashes[name]=[]
 for index,r in enumerate(x['records']):
  raw=(a.artifacts/name/r['artifact']).read_bytes();artifact=json.loads(raw)
  assert artifact['source']['sha256']==m['variants'][index]['source_sha256']
  assert [k['identity'] for k in artifact['kernels']]==r['kernel_identities']
  artifact_hashes[name].append(hashlib.sha256(raw).hexdigest())
  for key in ['name','source','compiler_policy']:artifact.pop(key,None)
  semantic_hashes[name].append(hashlib.sha256(json.dumps(artifact,sort_keys=True).encode()).hexdigest())
 changes[name]=[{'graph':r['graph'],'split':r['split'],'before_kernels':b['kernel_count'],'after_kernels':r['kernel_count']} for b,r in zip(baseline['records'],x['records']) if b['fingerprint']!=r['fingerprint']]
assert not changes['default'],'Default policy changed executable fingerprint'
assert semantic_hashes['default']==semantic_hashes['baseline'],'Default artifact semantics changed'
result={'membership_sha256':m['membership_sha256'],'default_equals_unchanged':True,'artifact_sha256':artifact_hashes,'semantic_sha256':semantic_hashes,'changes':changes,'scope':'Structural preflight only; no GPU timing or performance selection'}
a.output.write_text(json.dumps(result,indent=2)+'\n');print({k:len(v) for k,v in changes.items()})
