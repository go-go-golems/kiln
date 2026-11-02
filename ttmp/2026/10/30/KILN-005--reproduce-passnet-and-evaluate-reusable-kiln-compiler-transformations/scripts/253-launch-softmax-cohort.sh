#!/usr/bin/env bash
set -eu
COHORT=${1:?pass frozen cohort run name}
PLAN=${2:?pass frozen plan basename}
[[ "$COHORT" =~ ^(softmax-cohort|reshape-source-cohort)-v[0-9]+$ ]]
[[ "$PLAN" =~ ^[a-z0-9-]+\.json$ ]]
ssh bling.local "tmux new-session -d -s passnet-$COHORT \"sg docker -c 'bash /home/manuel/passnet-kiln/KILN-005/250-run-softmax-cohort.sh $COHORT $PLAN' > /home/manuel/passnet-kiln/KILN-005/$COHORT-driver.log 2>&1; echo EXIT_CODE=\\\$?; sleep 3600\""
