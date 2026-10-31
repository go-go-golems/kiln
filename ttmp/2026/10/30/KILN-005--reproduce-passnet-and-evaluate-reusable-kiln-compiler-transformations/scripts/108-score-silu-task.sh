#!/usr/bin/env bash
# Inside container, original scorer; integration protocol is recorded by source log.
set -eu
mkdir -p /work/sixth-task-score
cp /work/sixth-task-isolated.log /work/sixth-task-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/sixth-task-score/validation.log --sample-id 144 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/sixth-task-score/score.json
