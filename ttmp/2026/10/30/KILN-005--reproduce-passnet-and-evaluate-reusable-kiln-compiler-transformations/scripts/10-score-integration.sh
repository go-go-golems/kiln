#!/usr/bin/env bash
# Run inside GPU container at /work/upstream; official scorer on modified-protocol log.
set -eu
mkdir -p /work/normalized-protocol-score
cp /work/stream-policy.log /work/normalized-protocol-score/validation.log
python -m pass_bench.aggregate_es_scores --benchmark-path /work/normalized-protocol-score/validation.log --sample-id 1 --disable-aggregation-mode --negative-speedup-penalty 0 --fpdb 0.1 --output-json-file-path /work/stream-policy-score.json
