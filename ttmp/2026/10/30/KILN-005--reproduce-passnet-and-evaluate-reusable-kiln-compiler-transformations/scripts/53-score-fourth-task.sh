#!/usr/bin/env bash
# Inside container, original scorer; integration protocol is recorded by source log.
set -eu
mkdir -p /work/fourth-task-score
cp /work/fourth-task-isolated-v4.log /work/fourth-task-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/fourth-task-score/validation.log --sample-id 11 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/fourth-task-score/score.json
