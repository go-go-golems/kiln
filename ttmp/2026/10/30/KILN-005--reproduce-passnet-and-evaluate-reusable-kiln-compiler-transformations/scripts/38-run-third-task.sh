#!/usr/bin/env bash
# Container execution; explicitly modified integration protocol, all twelve variants.
set -eu
SAMPLE=/work/upstream/samples/hf_subgraphs_v2/fusible_subgraphs/c2/0e/c20e23ad3e4813038bdba2dfdb57332997ee70eba6dafdd92a653c68dc6bbb0d
CONFIG=$(python -c 'import json,base64; print(base64.b64encode(json.dumps({"input_pass_rule_dir":"/work/empty-passes","output_pass_rule_dir":"/work/third-task-pass","output_pass_pattern_limit":100,"output_pass_replacement_func_limit":1,"pass_match_result_file_path":"/work/third-task-match-result.txt"}).encode()).decode())')
mkdir -p /work/empty-passes
while IFS= read -r graph; do
  test -n "$graph" || continue
  PYTHONPATH=/work/kiln/runtime/python:/work/kiln/integrations/passnet:/work/upstream python /work/kiln/integrations/passnet/evaluate_normalized.py --model-path "/work/upstream/$graph" --compiler pass_mgr --device cuda --warmup 20 --trials 100 --config "$CONFIG"
done < "$SAMPLE/graph_list.txt"
