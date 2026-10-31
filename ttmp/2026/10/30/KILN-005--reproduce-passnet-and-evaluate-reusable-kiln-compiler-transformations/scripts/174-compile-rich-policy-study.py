#!/usr/bin/env python3
"""Compile a committed frozen study; immutable source/plan checks surround every policy."""
import hashlib,json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
s=p/'sources';corpus=s/'policy-corpus-v5-r1';output=s/'policy-artifacts-v5-r1'
if output.exists():raise ValueError('Preserve all previous or partial artifacts')
output.mkdir();initial=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
for relative,digest in initial['files'].items():
 if hashlib.sha256(subprocess.check_output(['git','show',revision+':'+relative],cwd=repo)).hexdigest()!=digest:raise ValueError('Commit compiler sources before measurement: '+relative)
freeze=json.loads((corpus/'candidate-freeze.json').read_text());plan=json.loads((corpus/'measurement-plan.json').read_text())
def verify():
 if snapshot(repo)!=initial:raise ValueError('Compiler source changed during compilation')
 for name,digest in freeze['files_sha256'].items():
  if hashlib.sha256((corpus/name).read_bytes()).hexdigest()!=digest:raise ValueError('Study declaration changed: '+name)
receipt={'status':'running','code_revision':revision,'source_snapshot':initial,'node':subprocess.check_output(['node','--version'],text=True).strip(),'membership_sha256':freeze['membership_sha256'],'records':[]}
for name in plan['candidate_ids']:
 verify();command=['node',str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),'--output',str(output/name),'--policy',str(corpus/'policies'/(name+'.json')),'--target','a100','--phase','all']
 result=subprocess.run(command);receipt['records'].append({'policy':name,'command':command,'returncode':result.returncode})
 (output/'study-compile-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');verify()
receipt['status']='complete';(output/'study-compile-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
subprocess.run([sys.executable,str(repo/'integrations/passnet/qualify_policies.py'),'--corpus',str(corpus),'--artifacts',str(output),'--output',str(output/'sensitivity.json')],check=True)
print('QUALIFIED full frozen study; no GPU performance measurements yet',flush=True)
