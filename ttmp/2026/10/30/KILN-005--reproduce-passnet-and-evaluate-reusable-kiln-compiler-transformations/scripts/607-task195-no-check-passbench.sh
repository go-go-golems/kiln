#!/usr/bin/env bash
# Isolated diagnostic: bypass only Kiln's internal reference check at export.
# PassBench's original matching, correctness, and timing gates remain enabled.
set -euo pipefail

source_root=/home/manuel/passnet-kiln/KILN-005/sources/parallel-port-delta-qualification-v1
diagnostic_root=/home/manuel/passnet-kiln/KILN-005/sources/task195-no-check-diagnostic-v1
image=sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba
case_dir="$diagnostic_root/results/task-195"

if [[ -e "$diagnostic_root" ]]; then
  echo "Diagnostic output already exists: $diagnostic_root" >&2
  exit 1
fi
mkdir -p "$diagnostic_root/results"
cp -a "$source_root/results/task-195" "$case_dir"
mv "$case_dir/corpus/compile-receipt.json" "$case_dir/corpus/original-compile-receipt.json"
mv "$case_dir/corpus/000.kiln.compile.log" "$case_dir/corpus/original-compile.log"
sha256sum \
  "$case_dir/corpus/000.kiln.js" \
  "$case_dir/corpus/manifest.json" \
  "$case_dir/passes/KilnPattern0000.py" \
  "$case_dir/passes/_kiln_generated_runtime.py" \
  > "$case_dir/input-sha256.txt"

cd "$source_root/kiln"
node scripts/kiln-export.mjs \
  --script "$case_dir/corpus/000.kiln.js" \
  --target a100 \
  --contraction separate \
  --no-check \
  --out "$case_dir/corpus/000.kiln.json" \
  > "$case_dir/compile-no-check.log" 2>&1

docker run --rm --gpus all \
  -v "$diagnostic_root:/work" \
  -v "$source_root/kiln:/work/kiln:ro" \
  -v "$source_root/upstream:/work/upstream:ro" \
  -w /work/kiln/integrations/passnet \
  --entrypoint python "$image" \
  run_task.py \
  --directory /work/results/task-195/corpus \
  --upstream /work/upstream \
  --pass-directory /work/results/task-195/passes \
  --log /work/results/task-195/benchmark.log \
  --warmup 20 --trials 100 \
  > "$case_dir/run-task.log" 2>&1

docker run --rm \
  -v "$diagnostic_root:/work" \
  -v "$source_root/kiln:/work/kiln:ro" \
  -v "$source_root/upstream:/work/upstream:ro" \
  -w /work/kiln/integrations/passnet \
  --entrypoint python "$image" \
  score_task.py \
  --log /work/results/task-195/benchmark.log \
  --sample-id 196 \
  --upstream /work/upstream \
  --output /work/results/task-195/score.json \
  > "$case_dir/score.log" 2>&1

echo 'Diagnostic complete; this result must not enter normal coverage accounting.'
