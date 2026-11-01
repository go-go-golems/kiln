#!/bin/bash
# usage (on bling, in ~/passnet-kiln/coverage-fix): stage-task.sh INDEX SAMPLE  -> fix/task-NNN/{corpus,passes}
# export + pass generation in the evaluator image (kiln-fix snapshot), compile on the host with the
# coverage-wave plan's settings (a100, contraction separate, tf32, mutation strategy auto, no internal check)
set -eu
I=$(printf %03d $1); S=$2; D=fix/task-$I
rm -rf $D; mkdir -p $D
cat > $D/stage.py <<PY
import sys; sys.path.insert(0, "/work/kiln-fix/integrations/passnet")
from pathlib import Path
from corpus import export_task
from generate_pass import generate
c = Path("/work/$D/corpus")
export_task(Path("/work/upstream"), "$S", c)
generate(c, Path("/work/upstream"), Path("/work/$D/passes"), c)
PY
sg docker -c "docker run --rm -v $PWD:/work -w /work/kiln-fix/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'python3 /work/$D/stage.py > /work/$D/export.log 2>&1; echo export=\$?; chown -R 1000:1000 /work/fix'"
cd kiln-fix && python3 integrations/passnet/corpus.py compile --directory ../$D/corpus --kiln . --target a100 --contraction separate --matmul-precision tf32 --mutation-strategy auto --skip-internal-reference-check > ../$D/compile.log 2>&1; echo compile=$?
