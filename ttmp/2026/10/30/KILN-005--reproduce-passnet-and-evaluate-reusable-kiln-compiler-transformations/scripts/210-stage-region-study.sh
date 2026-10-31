#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
test -f "$TICKET/sources/policy-artifacts-v7/sensitivity.json"
python3 integrations/passnet/stage_corpus.py --corpus "$TICKET/sources/policy-corpus-v7" --upstream "$TICKET/sources/upstream" --destination "$DEST/upstream/"
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a "$TICKET/sources/policy-corpus-v7" "$TICKET/sources/policy-artifacts-v7" "$DEST/"
rsync -a "$TICKET/scripts/179-run-rich-full-precision.py" "$TICKET/scripts/211-run-region-training.sh" "$TICKET/scripts/212-run-region-heldout.sh" "$DEST/"
python3 integrations/passnet/verify_host_source.py --checkpoint "$TICKET/sources/policy-artifacts-v7/study-compile-receipt.json" --host bling.local --kiln /home/manuel/passnet-kiln/KILN-005/kiln --output "$TICKET/sources/region-remote-source-verification.json"
