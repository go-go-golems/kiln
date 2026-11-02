#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
python3 integrations/passnet/stage_corpus.py --corpus "$TICKET/sources/policy-corpus-v6" --upstream "$TICKET/sources/upstream" --destination "$DEST/upstream/"
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a "$TICKET/sources/policy-corpus-v6" "$TICKET/sources/policy-artifacts-v6" "$DEST/"
rsync -a "$TICKET/scripts/179-run-rich-full-precision.py" "$TICKET/scripts/196-run-selective-training.sh" "$TICKET/scripts/197-run-selective-heldout.sh" "$DEST/"
