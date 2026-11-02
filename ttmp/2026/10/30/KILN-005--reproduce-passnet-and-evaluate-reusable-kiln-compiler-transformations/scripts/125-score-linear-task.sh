#!/usr/bin/env bash
# Inside container, original scorer; integration protocol is recorded by source log.
set -eu
mkdir -p /work/seventh-task-score
cp /work/seventh-task-isolated.log /work/seventh-task-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/seventh-task-score/validation.log --sample-id 122 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/seventh-task-score/score.json
