#!/usr/bin/env python3
"""Stage the exact source snapshot; reject remote differences before evaluation."""
import argparse,json,shlex,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--receipt',required=True);parser.add_argument('--plan',required=True);args=parser.parse_args()
if Path(args.receipt).name!=args.receipt or Path(args.plan).name!=args.plan:raise ValueError('Receipt must be a new basename')
if (p/'sources'/args.receipt).exists():raise ValueError('Preserve earlier source verification')
expected=snapshot(repo);base='/home/manuel/passnet-kiln/KILN-005'
with tempfile.NamedTemporaryFile(mode='w') as names:
 names.write('\n'.join(expected['files'])+'\n');names.flush()
 subprocess.run(['rsync','-a','--files-from='+names.name,str(repo)+'/', 'bling.local:'+base+'/kiln/'],check=True)
subprocess.run(['scp',str(p/'sources'/args.plan),str(p/'scripts/250-run-softmax-cohort.sh'),'bling.local:'+base+'/'],check=True)
code='import json,sys;from pathlib import Path;sys.path.insert(0,'+repr(base+'/kiln/integrations/passnet')+');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path('+repr(base+'/kiln')+'))))'
actual=json.loads(subprocess.check_output(['ssh','bling.local','python3 -c '+shlex.quote(code)],text=True))
if actual!=expected:raise ValueError('Remote source snapshot differs; inspect unexpected files, do not start evaluation')
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
for name,digest in expected['files'].items():
 import hashlib
 if hashlib.sha256(subprocess.check_output(['git','show',revision+':'+name],cwd=repo)).hexdigest()!=digest:raise ValueError('Source is not committed: '+name)
receipt={'revision':revision,'snapshot':expected,'remote_matches':True}
(p/'sources'/args.receipt).write_text(json.dumps(receipt,indent=2)+'\n')
print(revision,expected['sha256'],len(expected['files']),'source files match')
