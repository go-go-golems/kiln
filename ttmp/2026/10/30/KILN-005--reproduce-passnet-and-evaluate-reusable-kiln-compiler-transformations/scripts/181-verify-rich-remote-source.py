#!/usr/bin/env python3
"""Compare the measurement host's source bytes with the compilation checkpoint."""
import json,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from evaluate_tasks import snapshot
remote="from pathlib import Path; from evaluate_tasks import snapshot; import json; print(json.dumps(snapshot(Path('/home/manuel/passnet-kiln/KILN-005/kiln'))))"
observed=json.loads(subprocess.check_output(['ssh','bling.local','cd /home/manuel/passnet-kiln/KILN-005/kiln/integrations/passnet && python3 -c '+__import__('shlex').quote(remote)],text=True))
expected=json.loads((p/'sources/policy-artifacts-v5-r1/study-compile-receipt.json').read_text())['source_snapshot']
missing=[k for k in expected['files'] if k not in observed['files']]
changed=[k for k,v in expected['files'].items() if k in observed['files'] and observed['files'][k]!=v]
extra=sorted(set(observed['files'])-set(expected['files']))
result={'expected_snapshot':expected['sha256'],'observed_snapshot':observed['sha256'],'missing':missing,'changed':changed,'extra':extra,'observed':observed,'matches':not(missing or changed or extra)}
(p/'sources/rich-remote-source-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='observed'}))
if not result['matches']:raise SystemExit(1)
