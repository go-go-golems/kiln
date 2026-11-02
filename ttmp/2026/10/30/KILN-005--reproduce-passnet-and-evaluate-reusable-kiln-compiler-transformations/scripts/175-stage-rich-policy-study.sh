#!/usr/bin/env bash
# Local worktree: stage the frozen declaration, all artifacts and exact source graphs.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
python3 integrations/passnet/stage_corpus.py --corpus "$TICKET/sources/policy-corpus-v5-r1" --upstream "$TICKET/sources/upstream" --destination "$DEST/upstream/"
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a "$TICKET/sources/policy-corpus-v5-r1" "$TICKET/sources/policy-artifacts-v5-r1" "$DEST/"
rsync -a "$TICKET/scripts/176-run-rich-policy-training.sh" "$DEST/"
