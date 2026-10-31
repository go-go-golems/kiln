#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:/usr/bin:/bin
ROOT=/home/manuel/passnet-kiln/KILN-005
cd "$ROOT/kiln"
test ! -e "$ROOT/singleton-view-fixtures-v1/compile-receipt.json"
test ! -e "$ROOT/singleton-view-source-cohort-v1/run.json"
test -z "$(docker ps -q --filter name=kiln005-qwen-original-server-v1)"
python3 integrations/passnet/corpus.py compile --directory "$ROOT/singleton-view-fixtures-v1" --kiln "$ROOT/kiln" --target a100 > "$ROOT/singleton-view-fixture-compile-v1.log" 2>&1
docker run --rm --gpus all --env PYTHONPATH=/work/kiln/runtime/python:/work/upstream -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint python sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba check_corpus_cuda.py --directory /work/singleton-view-fixtures-v1 --upstream /work/singleton-view-fixture-models-v1 --seed 42 --include-path /usr/local/cuda/include > "$ROOT/singleton-view-fixture-cuda-v1.log" 2>&1
python3 - <<'PYCODE'
import json
from pathlib import Path
p=Path('/home/manuel/passnet-kiln/KILN-005/singleton-view-fixtures-v1');rows=json.loads((p/'gpu-random-receipt.json').read_text());assert len(rows)==12 and all(row['status']=='passed' and len(row['output_max_abs_errors'])==6 and all(error==0 for error in row['output_max_abs_errors']) for row in rows)
print('PASS:12 fixture programs/72 exact finite output comparisons')
PYCODE
python3 integrations/passnet/evaluate_tasks.py --root "$ROOT" --plan "$ROOT/singleton-view-source-cohort-plan.json" --output "$ROOT/singleton-view-source-cohort-v1" --image sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba
