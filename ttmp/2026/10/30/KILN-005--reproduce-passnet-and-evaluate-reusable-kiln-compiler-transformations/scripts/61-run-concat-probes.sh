#!/usr/bin/env bash
# On bling, shared runners; correctness only.
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
python3 integrations/passnet/corpus.py compile --directory ../concat --kiln . --target a100
node scripts/run-node-tests.mjs packages/kiln/test
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python python check_corpus_cuda.py --directory /work/concat --upstream /work --include-path /usr/local/cuda/include'
