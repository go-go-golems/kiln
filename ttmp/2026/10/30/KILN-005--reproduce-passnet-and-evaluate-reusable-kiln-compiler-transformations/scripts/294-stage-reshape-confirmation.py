#!/usr/bin/env python3
"""Stage a fully frozen fixed-compiler study and verify exact remote runtime code."""
import json,shlex,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from compiler_confirmation import verify_freeze
s=p/'sources';corpus=s/'reshape-confirmation-v2';_,_,freeze=verify_freeze(corpus,repo);base='/home/manuel/passnet-kiln/KILN-005';dest='bling.local:'+base
with tempfile.NamedTemporaryFile(mode='w') as listing:
 listing.write('\n'.join(freeze['execution_source_snapshot']['files'])+'\n');listing.flush()
 subprocess.run(['rsync','-a','--files-from='+listing.name,str(repo)+'/',dest+'/kiln/'],check=True)
subprocess.run(['rsync','-a',str(corpus),str(s/'reshape-confirmation-artifacts-v2'),dest+'/'],check=True)
subprocess.run(['python3','integrations/passnet/stage_corpus.py','--corpus',str(corpus),'--upstream',str(s/'upstream'),'--destination',dest+'/upstream/'],cwd=repo,check=True)
subprocess.run(['scp',str(p/'scripts/295-run-reshape-confirmation.sh'),dest+'/'],check=True)
code='import json,sys;from pathlib import Path;sys.path.insert(0,'+repr(base+'/kiln/integrations/passnet')+');from evaluate_tasks import snapshot;print(json.dumps(snapshot(Path('+repr(base+'/kiln')+'))))'
actual=json.loads(subprocess.check_output(['ssh','bling.local','python3 -c '+shlex.quote(code)],text=True))
if actual!=freeze['execution_source_snapshot']:raise ValueError('Remote runtime code differs from frozen study')
output=s/'reshape-confirmation-remote-verification-v2.json'
with output.open('x') as file:file.write(json.dumps({'scope':'Exact common compiler/runtime execution sources before confirmation GPU run','matches':True,'snapshot':actual,'execution_code_revision':freeze['execution_code_revision']},indent=2)+'\n')
print('Exact frozen execution sources verified remotely')
