#!/usr/bin/env bash
# On bling: selection reads complete training evidence only; no GPU access needed.
set -eu
docker run --rm -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 select_policy.py --training /work/policy-measurements-v1/train.json --output /work/policy-measurements-v1/selection.json
