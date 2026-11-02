#!/usr/bin/env bash
# Local worktree: stage every manifest source before replay.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/stage_corpus.py --corpus "$TICKET/sources/policy-corpus-v4" --upstream "$TICKET/sources/upstream" --destination bling.local:/home/manuel/passnet-kiln/KILN-005/upstream/
