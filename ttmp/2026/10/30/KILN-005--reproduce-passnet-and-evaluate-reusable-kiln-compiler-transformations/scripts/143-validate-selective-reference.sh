#!/usr/bin/env bash
# On bling; preceding cohort is terminal. No GPU is used by this validation.
set -eu
export PATH=/usr/local/bin:$PATH
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/run-node-tests.mjs packages/kiln/test
python3 - <<'PYTHON'
import json
from pathlib import Path
root=Path('/home/manuel/passnet-kiln/KILN-005');corpus=root/'reference-domain-cohort-v1/task-182/corpus'
record=json.loads((corpus/'manifest.json').read_text())['variants'][5]
source=(corpus/record['script']).read_text();old='inputsFor(passnetProject.graph());'
if source.count(old)!=1:raise ValueError('Unexpected diagnostic source')
names=list(dict.fromkeys(c['input'] for c in record['reference_constraints']))
source=source.replace(old,'inputsFor(passnetProject.graph(), {names: '+json.dumps(names)+'});')
(root/'selective-reference-probe.kiln.js').write_text(source)
PYTHON
node scripts/kiln-export.mjs --script /home/manuel/passnet-kiln/KILN-005/selective-reference-probe.kiln.js --target a100 --out /home/manuel/passnet-kiln/KILN-005/selective-reference-probe.kiln.json
