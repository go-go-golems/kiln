#!/usr/bin/env bash
set -eu
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/upstream --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/upstream python /work/40-inspect-third-pattern.py'
