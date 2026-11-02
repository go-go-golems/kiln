#!/usr/bin/env bash
# Inside container, original scorer; integration protocol is recorded by source log.
set -eu
mkdir -p /work/fifth-task-score
cp /work/fifth-task-isolated.log /work/fifth-task-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/fifth-task-score/validation.log --sample-id 198 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/fifth-task-score/score.json
