#!/usr/bin/env python3
"""Stage the frozen fixture and exact common runtime without loading test graphs."""
import json,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from compiler_confirmation import verify_freeze
root=p/'sources/reshape-confirmation-harness-fixture-v1';_,_,freeze=verify_freeze(root/'corpus',repo);destination='bling.local:/home/manuel/passnet-kiln/KILN-005'
with tempfile.NamedTemporaryFile(mode='w') as listing:
 listing.write('\n'.join(freeze['execution_source_snapshot']['files'])+'\n');listing.flush()
 subprocess.run(['rsync','-a','--files-from='+listing.name,str(repo)+'/',destination+'/kiln/'],check=True)
subprocess.run(['rsync','-a','--exclude=__pycache__/','--exclude=*.pyc',str(root)+'/',destination+'/confirmation-harness/'],check=True)
subprocess.run(['scp',str(p/'scripts/291-run-confirmation-harness-fixture.sh'),destination+'/'],check=True)
