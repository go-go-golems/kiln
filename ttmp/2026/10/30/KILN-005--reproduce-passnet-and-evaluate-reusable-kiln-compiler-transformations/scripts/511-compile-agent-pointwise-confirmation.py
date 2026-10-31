"""Use the shared compiler and protected reference checks for the frozen pair."""
import json,subprocess,sys
from pathlib import Path
root=Path.cwd();T=Path(__file__).resolve().parent.parent;out=T/'sources/pointwise-agent-confirmation-v1';corpus=out/'corpus'
sys.path.insert(0,str(root/'integrations/passnet'))
from reference_domains import reference_domains
(corpus/'reference-domains.json').write_text(json.dumps(reference_domains(corpus,T/'sources/upstream'),indent=2)+'\n')
policies={'baseline':{'format':'kiln-fusion-policy/1','id':'baseline','kind':'unchanged'},'pointwise':json.loads((out/'declaration.json').read_text())['fixed_artifact']['artifact']['program']}
selected=json.loads((out/'declaration.json').read_text())['selected_agent_policy']
policies[selected['id']]=selected
proposals=T/'sources/pointwise-agent-confirmation-proposals-v1';proposals.mkdir()
(proposals/'declaration.json').write_text(json.dumps({'scope':'One fixed development-selected policy, no confirmation adaptation','policies':[selected]},indent=2)+'\n')
results=[]
for name,policy in policies.items():
 path=out/(name+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
 cmd=['/home/manuel/.nvm/versions/node/v26.13.0/bin/node','integrations/passnet/compile_policy.mjs','--directory',str(corpus),'--output',str((proposals if name==selected['id'] else out)/name),'--policy',str(path),'--target','a100','--phase','heldout']
 with (out/(name+'-compile.log')).open('w') as log:result=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 results.append({'candidate':name,'command':cmd,'returncode':result.returncode});print(name,result.returncode,flush=True)
(out/'compilation.json').write_text(json.dumps(results,indent=2)+'\n')
