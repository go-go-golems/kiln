"""Deduplicate actual accepted agent programs and compile all development cases."""
import json,subprocess
from pathlib import Path
root=Path.cwd();T=Path(__file__).resolve().parent.parent;s=T/'sources';lanes=s/'pi-pointwise-lanes-v1';development=s/'pointwise-agent-development-v1'
summary=json.loads((lanes/'summary.json').read_text())
assert len(summary)==6 and all(r['returncode']==0 for r in summary)
out=s/'pointwise-agent-proposals-v1';out.mkdir();(out/'policies').mkdir()
seen={};origins={}
for path in sorted(lanes.glob('*/run/task/*.artifact.json')):
 artifact=json.loads(path.read_text());key=json.dumps(artifact,sort_keys=True)
 if key not in seen:
  policy=artifact['program'];policy['id']='agent-'+str(len(seen)+1);seen[key]=policy
 origins.setdefault(seen[key]['id'],[]).append(str(path.relative_to(T)))
(out/'origins.json').write_text(json.dumps(origins,indent=2)+'\n')
(out/'declaration.json').write_text(json.dumps({'scope':'All unique valid proposals from six lanes, before candidate compilation or GPU timing','membership_sha256':json.loads((development/'corpus/manifest.json').read_text())['membership_sha256'],'policies':list(seen.values())},indent=2)+'\n')
results=[]
for policy in seen.values():
 name=policy['id'];path=out/'policies'/(name+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
 cmd=['/home/manuel/.nvm/versions/node/v26.13.0/bin/node','integrations/passnet/compile_policy.mjs','--directory',str(development/'corpus'),'--output',str(out/name),'--policy',str(path),'--target','a100','--phase','train']
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 results.append({'policy':name,'returncode':r.returncode});(out/'compilation.json').write_text(json.dumps(results,indent=2)+'\n');print(name,r.returncode,flush=True)
print('unique programs',len(seen),'accepted artifacts',sum(map(len,origins.values())),flush=True)
