#!/usr/bin/env bash
# Inside container, original scorer; integration protocol is recorded by source log.
set -eu
mkdir -p /work/third-task-score
cp /work/third-task-isolated-v2.log /work/third-task-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/third-task-score/validation.log --sample-id 1 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/third-task-score/score.json
