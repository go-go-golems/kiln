#!/usr/bin/env bash
# Container execution; explicitly modified integration protocol, all six variants.
set -eu
SAMPLE=/work/upstream/samples/hf_subgraphs_v2/fusible_subgraphs/62/91/6291d774daf9c8b62c3f7d79f1fc55ec2d82adcd69425bfb0bb4e00b14724de8
CONFIG=$(python -c 'import json,base64; print(base64.b64encode(json.dumps({"input_pass_rule_dir":"/work/empty-passes","output_pass_rule_dir":"/work/kiln-task-pass","output_pass_pattern_limit":100,"output_pass_replacement_func_limit":1,"pass_match_result_file_path":"/work/task-match-result.txt"}).encode()).decode())')
mkdir -p /work/empty-passes
while IFS= read -r graph; do
  test -n "$graph" || continue
  PYTHONPATH=/work/kiln/runtime/python:/work/kiln/integrations/passnet:/work/upstream python /work/kiln/integrations/passnet/evaluate_normalized.py --model-path "/work/upstream/$graph" --compiler pass_mgr --device cuda --warmup 20 --trials 100 --config "$CONFIG"
done < "$SAMPLE/graph_list.txt"
