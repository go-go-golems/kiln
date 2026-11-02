#!/usr/bin/env python3
"""Bind the remote measurement host to the committed study compilation sources."""
import json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1]
code="from pathlib import Path; from evaluate_tasks import snapshot; import json; print(json.dumps(snapshot(Path('/home/manuel/passnet-kiln/KILN-005/kiln'))))"
observed=json.loads(subprocess.check_output(['ssh','bling.local','cd /home/manuel/passnet-kiln/KILN-005/kiln/integrations/passnet && python3 -c '+shlex.quote(code)],text=True))
expected=json.loads((p/'sources/policy-artifacts-v6/study-compile-receipt.json').read_text())['source_snapshot']
result={'expected_snapshot':expected['sha256'],'observed_snapshot':observed['sha256'],'matches':observed==expected,'observed':observed}
(p/'sources/selective-remote-source-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print('REMOTE SOURCE MATCH',result['matches'],result['observed_snapshot'])
if not result['matches']:raise SystemExit(1)
