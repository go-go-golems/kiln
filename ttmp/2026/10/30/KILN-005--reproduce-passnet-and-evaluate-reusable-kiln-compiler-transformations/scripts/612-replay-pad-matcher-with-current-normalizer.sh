#!/usr/bin/env bash
# Diagnostic only: previously compiled --no-check programs, newer matcher code.
# The mixed source snapshots deliberately test the matching hypothesis; this
# run does not enter the normal coverage ledger.
set -euo pipefail

base=/home/manuel/passnet-kiln/KILN-005/sources
previous="$base/seven-family-no-check-diagnostic-v1"
matcher="$base/normalized-matcher-qualification-v1/kiln"
output="$base/pad-matcher-replay-v1"
image=sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba

if [[ -e "$output" ]]; then
  echo "Preserve existing diagnostic: $output" >&2
  exit 1
fi
mkdir -p "$output/results"
sha256sum "$matcher/integrations/passnet/fx_normalize.py" > "$output/matcher-sha256.txt"

for index in 110 146; do
  case_dir="$output/results/task-$index"
  mounted="/work/results/task-$index"
  mkdir -p "$case_dir"
  cp -a "$previous/results/task-$index/corpus" "$case_dir/corpus"
  cp -a "$previous/results/task-$index/passes" "$case_dir/passes"
  if [[ "$index" == 110 ]]; then
    upstream="$base/parallel-port-qualification-v1/upstream"
  else
    upstream="$base/parallel-port-delta-qualification-v1/upstream"
  fi

  docker run --rm --gpus all \
    -v "$output:/work" \
    -v "$matcher:/work/kiln:ro" \
    -v "$upstream:/work/upstream:ro" \
    -w /work/kiln/integrations/passnet \
    --entrypoint python "$image" \
    run_task.py \
    --directory "$mounted/corpus" \
    --upstream /work/upstream \
    --pass-directory "$mounted/passes" \
    --log "$mounted/benchmark.log" \
    --warmup 20 --trials 100 \
    > "$case_dir/run-task.log" 2>&1

  docker run --rm \
    -v "$output:/work" \
    -v "$matcher:/work/kiln:ro" \
    -v "$upstream:/work/upstream:ro" \
    -w /work/kiln/integrations/passnet \
    --entrypoint python "$image" \
    score_task.py \
    --log "$mounted/benchmark.log" \
    --sample-id "$((index + 1))" \
    --upstream /work/upstream \
    --output "$mounted/score.json" \
    > "$case_dir/score.log" 2>&1
  echo "task $index: matcher replay and scorer completed"
done
