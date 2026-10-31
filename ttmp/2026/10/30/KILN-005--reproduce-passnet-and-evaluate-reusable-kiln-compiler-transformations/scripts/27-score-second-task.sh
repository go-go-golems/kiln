#!/usr/bin/env bash
# Inside container, original scorer; integration protocol is recorded by source log.
set -eu
mkdir -p /work/second-task-score
cp /work/second-task-isolated.log /work/second-task-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/second-task-score/validation.log --sample-id 1 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/second-task-score/score.json
