#!/usr/bin/env bash
# Host-side driver for our identified reference container; always resume on exit.
set -eu
REFERENCE=2481540b02eb
EXPECTED='["/work/02-run-reference.py","--upstream","/work/upstream","--output","/work/results/reference-full","--compiler","inductor"]'
test "$(docker inspect "$REFERENCE" --format '{{json .Config.Cmd}}')" = "$EXPECTED"
trap 'docker unpause "$REFERENCE"' EXIT
docker pause "$REFERENCE"
nvidia-smi
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/upstream --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/kiln/integrations/passnet/run_task.py --directory /work/fifth-task --upstream /work/upstream --pass-directory /work/fifth-task-pass --log /work/fifth-task-isolated.log
