#!/usr/bin/env bash
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
node scripts/run-node-tests.mjs packages/kiln/test
