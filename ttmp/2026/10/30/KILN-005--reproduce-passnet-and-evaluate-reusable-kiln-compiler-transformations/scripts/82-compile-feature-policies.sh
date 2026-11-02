#!/usr/bin/env bash
# On bling: compile declared candidates; no GPU timing or confirmation selection.
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
node integrations/passnet/test_fusion_policy.mjs
python3 - <<'PY'
import json,subprocess
from pathlib import Path
root=Path('/home/manuel/passnet-kiln/KILN-005');corpus=root/'policy-corpus-v3';plan=json.loads((corpus/'measurement-plan.json').read_text())
for name in plan['candidate_ids']:
 subprocess.run(['node','integrations/passnet/compile_policy.mjs','--directory',str(corpus),'--output',str(root/'policy-artifacts-v3'/name),'--policy',str(corpus/'policies'/(name+'.json')),'--target','a100'],check=True)
PY
