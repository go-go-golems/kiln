#!/usr/bin/env bash
# On bling under sg docker: container-created result directory is root-owned.
set -eu
docker run --rm -v /home/manuel/passnet-kiln/KILN-005:/work --entrypoint cp localhost:5000/playback-redaction:base-26.05 /work/feature-selection.json /work/policy-measurements-v2/selection.json
bash /home/manuel/passnet-kiln/KILN-005/86-run-feature-policy-heldout.sh
