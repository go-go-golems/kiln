#!/usr/bin/env python3
"""Verify actual model artifacts and compile all accepted programs on training graphs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot

source=ticket/'sources/native-agent-smoke-terminal-v1'
out=ticket/'sources/native-agent-compilation-v1'
out.mkdir()
initial=snapshot(repo)
corpus=ticket/'sources/policy-corpus-v8-r2'
run=json.loads((source/'run.json').read_text())
assert run['status']=='complete' and run['container_absent']
assert run['gpu_processes_after']=='', 'No isolated timing allowed with active GPU processes'
manifest=json.loads((corpus/'manifest.json').read_text())
programs=[('baseline',{'format':'kiln-fusion-policy/1','id':'baseline','kind':'unchanged'},None)]
for path in sorted((source/'output/task').glob('*.artifact.json')):
    artifact=json.loads(path.read_text())
    request={'policy':artifact['program'],'numerical_policy':manifest['numerical_policy']}
    result=subprocess.run(['node',str(repo/'integrations/passnet/optimization_artifact.mjs')],input=json.dumps(request),text=True,capture_output=True,check=True)
    validated=json.loads(result.stdout)
    receipt=json.loads(path.with_name(path.name.replace('.artifact.json','.result.json')).read_text())
    assert validated['artifact']==artifact
    assert validated['artifact_sha256']==receipt['artifact_sha256']
    programs.append((path.name.removesuffix('.artifact.json'),artifact['program'],validated['artifact_sha256']))
assert len(programs)>1
records=[]
for name,policy,digest in programs:
    path=out/(name+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
    command=['node',str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),
             '--output',str(out/name),'--policy',str(path),'--target','a100','--phase','train']
    result=subprocess.run(command,text=True,capture_output=True)
    (out/(name+'.stdout.txt')).write_text(result.stdout);(out/(name+'.stderr.txt')).write_text(result.stderr)
    receipt_path=out/name/'compile-receipt.json'
    receipt=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
    records.append({'candidate':name,'optimization_artifact_sha256':digest,'returncode':result.returncode,
                    'receipt':str(receipt_path.relative_to(out)) if receipt else None,
                    'compiled':sum(r['status']=='compiled' for r in receipt['records']) if receipt else 0,
                    'failed':sum(r['status']=='failed' for r in receipt['records']) if receipt else None})
    assert snapshot(repo)==initial,'Source mutation during compilation'
baseline=json.loads((out/'baseline/compile-receipt.json').read_text())
for record in records[1:]:
    receipt=json.loads((out/record['receipt']).read_text())
    record['changed_graphs']=[r['graph'] for r,b in zip(receipt['records'],baseline['records'])
                              if r['status']=='compiled' and b['status']=='compiled' and r['fingerprint']!=b['fingerprint']]
summary={'format':'kiln-native-agent-compilation/1','source_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),
         'source_snapshot':initial,'records':records,'scope':'Real model proposals; compiler-reference validation only; native correctness and performance not measured'}
(out/'result.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(records,indent=2))
