#!/usr/bin/env bash
# On bling: isolate this study from our own known reference container only.
set -eu
REFERENCE=2481540b02eb
EXPECTED='["/work/02-run-reference.py","--upstream","/work/upstream","--output","/work/results/reference-full","--compiler","inductor"]'
POLICY_REFERENCE_PAUSED=0
cleanup() { if [ "$POLICY_REFERENCE_PAUSED" = 1 ]; then docker unpause "$REFERENCE"; fi; }
trap cleanup EXIT
if docker inspect "$REFERENCE" >/dev/null 2>&1; then
 test "$(docker inspect "$REFERENCE" --format '{{json .Config.Cmd}}')" = "$EXPECTED"
 if [ "$(docker inspect "$REFERENCE" --format '{{.State.Running}}')" = true ]; then
  test "$(docker inspect "$REFERENCE" --format '{{.State.Paused}}')" = false
  docker pause "$REFERENCE"
  POLICY_REFERENCE_PAUSED=1
 fi
fi
nvidia-smi
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python:/work/upstream python measure_policy.py --corpus /work/policy-corpus-v2 --artifacts /work/policy-artifacts-v2 --upstream /work/upstream --output /work/policy-measurements-v1/train.json --phase train --include-path /usr/local/cuda/include'
