#!/usr/bin/env python3
"""Run on bling host; compile every pinned fourth-task variant with receipts."""
from pathlib import Path
import json
import subprocess
root=Path('/home/manuel/passnet-kiln/KILN-005')
manifest=json.loads((root/'fourth-task/manifest.json').read_text())
results=[]
for record in manifest['variants']:
 source=root/'fourth-task'/record['script'];output=source.with_suffix('.json')
 command=['node','scripts/kiln-export.mjs','--script',str(source),'--target','a100','--out',str(output)]
 with source.with_suffix('.compile.log').open('w') as log:
  result=subprocess.run(command,cwd=root/'kiln',stdout=log,stderr=subprocess.STDOUT)
 results.append({'graph':record['graph'],'command':command,'returncode':result.returncode,'artifact':output.name})
 (root/'fourth-task/compile-receipt.json').write_text(json.dumps(results,indent=2)+'\n')
 print(record['script'],result.returncode,flush=True)
 if result.returncode: raise SystemExit(result.returncode)
