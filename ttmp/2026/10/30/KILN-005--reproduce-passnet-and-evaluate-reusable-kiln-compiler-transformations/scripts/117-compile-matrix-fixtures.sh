#!/usr/bin/env bash
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/run-node-tests.mjs packages/kiln/test
python3 integrations/passnet/corpus.py compile --directory ../linalg-fixtures --kiln . --target a100
