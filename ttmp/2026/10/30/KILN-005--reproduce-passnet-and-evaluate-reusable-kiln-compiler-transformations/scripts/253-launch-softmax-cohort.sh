#!/usr/bin/env bash
set -eu
ssh bling.local "tmux new-session -d -s passnet-softmax-cohort \"sg docker -c 'bash /home/manuel/passnet-kiln/KILN-005/250-run-softmax-cohort.sh' > /home/manuel/passnet-kiln/KILN-005/softmax-cohort-driver.log 2>&1; echo EXIT_CODE=\\\$?; sleep 3600\""
