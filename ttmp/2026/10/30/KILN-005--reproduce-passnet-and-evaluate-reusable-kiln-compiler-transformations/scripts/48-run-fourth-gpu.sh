#!/usr/bin/env bash
# Remote host: correctness comparison, no latency claims.
set -eu
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python:/work/kiln/integrations/passnet:/work/upstream python /work/scripts/54-fourth-task-check-checkpoint.py /work'
