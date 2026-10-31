#!/usr/bin/env bash
# Run on bling.local, inside existing GPU image; exploratory protocol smoke only.
set -eu
TASK=/work/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/8/samples/torchgeometric/LINKX/_decomposed/LINKX_start17_end20_5
CONFIG=$(python -c 'import json,base64; print(base64.b64encode(json.dumps({"input_pass_rule_dir":"/work/empty-passes","output_pass_rule_dir":"/work/kiln-pass","output_pass_pattern_limit":100,"output_pass_replacement_func_limit":1,"pass_match_result_file_path":"/work/kiln-match-result.txt"}).encode()).decode())')
mkdir -p /work/empty-passes
PYTHONPATH=/work/kiln/runtime/python:/work/kiln/integrations/passnet:/work/upstream python /work/kiln/integrations/passnet/evaluate_normalized.py --model-path "$TASK" --compiler pass_mgr --device cuda --warmup 20 --trials 100 --config "$CONFIG"
