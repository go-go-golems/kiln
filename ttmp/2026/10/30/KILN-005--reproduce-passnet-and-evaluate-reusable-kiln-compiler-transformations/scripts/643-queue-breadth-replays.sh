#!/usr/bin/env bash
set -eu
BASE=/home/manuel/passnet-kiln/KILN-005/sources
UNIFORM="$BASE/uniform-importable-qualification-v1"
SCALAR="$BASE/scalar-layout-batch-gpu-v1"
STRUCTURAL="$BASE/stack-unbind-batch-gpu-v1"

while tmux has-session -t kiln-uniform-importable-v1 2>/dev/null; do
  sleep 30
done

python3 - "$UNIFORM" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1])
plans=[('pending-ordinary',56),('pending-large',2),('regression',53)]
for band,count in plans:
    run=json.loads((root/band/'run.json').read_text())
    if run.get('status')!='complete' or len(run.get('records',[]))!=count:
        raise SystemExit(f'Uniform run incomplete: {band}')
print('UNIFORM COMPLETE: 111 tasks accounted for',flush=True)
PY

echo 'START scalar/layout five-family GPU replay'
sg docker -c "bash $SCALAR/run.sh" > "$SCALAR/owner.log" 2>&1
python3 - "$SCALAR/results/run.json" <<'PY'
import json,sys
run=json.load(open(sys.argv[1]))
if run.get('status')!='complete' or len(run.get('records',[]))!=5:
    raise SystemExit('Scalar/layout replay incomplete')
print('SCALAR COMPLETE: five tasks accounted for',flush=True)
PY

echo 'START stack/unbind three-family GPU replay'
sg docker -c "bash $STRUCTURAL/run.sh $STRUCTURAL" > "$STRUCTURAL/owner.log" 2>&1
python3 - "$STRUCTURAL/results/run.json" <<'PY'
import json,sys
run=json.load(open(sys.argv[1]))
if run.get('status')!='complete' or len(run.get('records',[]))!=3:
    raise SystemExit('Stack/unbind replay incomplete')
print('STRUCTURAL COMPLETE: three tasks accounted for',flush=True)
PY
