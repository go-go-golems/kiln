#!/usr/bin/env python3
"""Archive known diagnostic leftovers and stage the committed runtime for future runs."""
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'runtime/python/kiln_launch.py').exists())
run=json.loads((p/'sources/separate-rounding-cohort-v1/run.json').read_text());expected=run['source_snapshot']['files']
base='/home/manuel/passnet-kiln/KILN-005'
code='import hashlib\nfrom pathlib import Path\nroot=Path('+repr(base)+')\n'
for name in ['check_fourth_task_cuda.py','test_dispatch_policy_gpu.py']:
 relative='integrations/passnet/'+name
 code+='source=root/"kiln"/'+repr(relative)+'\n'
 code+='assert hashlib.sha256(source.read_bytes()).hexdigest()=='+repr(expected[relative])+'\n'
 code+='target=root/"scripts/archived"/'+repr(name)+'\n'
 code+='target.parent.mkdir(parents=True,exist_ok=True)\nassert not target.exists()\nsource.rename(target)\n'
subprocess.run(['ssh','bling.local','python3 -c '+shlex.quote(code)],check=True)
subprocess.run(['scp',str(repo/'runtime/python/kiln_launch.py'),str(repo/'runtime/python/test_kiln_launch.py'),'bling.local:'+base+'/kiln/runtime/python/'],check=True)
print('Archived two known leftovers; committed runtime staged. Earlier measured source overrides remain preserved.')
