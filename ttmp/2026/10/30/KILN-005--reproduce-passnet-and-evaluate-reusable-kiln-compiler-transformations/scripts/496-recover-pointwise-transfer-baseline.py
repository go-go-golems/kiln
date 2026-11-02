"""Correct the control policy spelling, preserving the initial rejected request."""
import json,subprocess
from pathlib import Path
T=Path(__file__).resolve().parent.parent;out=T/'sources/pointwise-transfer-v1'
(out/'baseline.json').rename(out/'baseline-invalid-v1.json')
(out/'baseline-compile.log').rename(out/'baseline-invalid-v1.log')
policy=out/'baseline.json';policy.write_text(json.dumps({'format':'kiln-fusion-policy/1','id':'baseline','kind':'unchanged'},indent=2)+'\n')
cmd=['/home/manuel/.nvm/versions/node/v26.13.0/bin/node','integrations/passnet/compile_policy.mjs','--directory',str(out/'corpus'),'--output',str(out/'baseline'),'--policy',str(policy),'--target','a100','--phase','heldout']
with (out/'baseline-compile.log').open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
(out/'baseline-recovery.json').write_text(json.dumps({'command':cmd,'returncode':r.returncode},indent=2)+'\n')
print('baseline',r.returncode)
