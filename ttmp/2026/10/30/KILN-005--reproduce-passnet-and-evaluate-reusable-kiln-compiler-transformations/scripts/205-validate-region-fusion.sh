#!/usr/bin/env bash
set -eu
node scripts/run-node-tests.mjs packages/kiln/test
node integrations/passnet/test_fusion_policy.mjs
python3 -m unittest discover -s integrations/passnet -p 'test_*.py'
