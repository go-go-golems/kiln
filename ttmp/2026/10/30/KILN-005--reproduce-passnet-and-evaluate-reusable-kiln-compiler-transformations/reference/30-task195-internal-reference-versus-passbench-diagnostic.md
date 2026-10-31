# Task 195: Kiln reference check versus PassBench correctness

## Question and experimental boundary

Task 195 was blocked by Kiln's export-time `endToEnd` check. The program compiled, but the frontend and loop evaluators disagreed on three BF16 output values. The first difference arose at an FP32 reduction and was approximately `2.7939677e-8` before downstream BF16 rounding. The question was whether the generated GPU program also failed PassBench's original numerical comparison.

The experiment used the unchanged task 195 Kiln source and generated Python pass. Their copied source hashes are in `sources/task195-no-check-diagnostic-v1/input-sha256.txt`; the Kiln source hash `4b17acb2d800e83840dcb0d5a5e4a241a7b083f29b9e9661fcc0a0e47e60b6e1` matches the original failed corpus artifact. The compiler used target `a100` and `--contraction separate`, as in the failed export. It added only `--no-check` to bypass Kiln's internal frontend-versus-loop comparison. PassBench's matcher, GPU execution, correctness check, and scorer were not modified.

The full command sequence is in `scripts/607-task195-no-check-passbench.sh`. It copied the task into an isolated directory on bling and mounted that directory at `/work`, preserving the generated pass's frozen corpus path. The original Kiln and upstream PassNet source trees were mounted read-only in the evaluator container. The image was `sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba` on the NVIDIA GB10 machine. The runner used 20 warmups and 100 timed trials.

## Observations

| Gate | Observation | Evidence |
|---|---|---|
| Kiln export with ordinary internal check | Failed at loop reference comparison | `sources/parallel-port-delta-task-results-v1/task-195/corpus/000.kiln.compile.log` and `sources/compiler-reference-failure-diagnostic-v1.json` |
| Kiln export with `--no-check` | Produced one `kiln-program/1` artifact | `sources/task195-no-check-diagnostic-v1/compile-no-check.log` |
| Original PassBench match | `True`; replacement selected | `sources/task195-no-check-diagnostic-v1/benchmark.matches.txt` |
| Original PassBench correctness | `status: success`; `max_diff: 0.0 0.0`; t=-5 comparison `1 1` | `sources/task195-no-check-diagnostic-v1/benchmark.log` |
| Original PassBench score | `1.07568` for sample id 196 | `sources/task195-no-check-diagnostic-v1/score.json` and `score.receipt.json` |
| Median timing | Eager E2E `0.142336` ms; compiled E2E `0.132322` ms; GPU speedup `1.08171` | `sources/task195-no-check-diagnostic-v1/benchmark.log` |

The original scorer reported an end-to-end speedup of `1.07568`. This is one complete task containing one graph. Its isolated success does not establish that the other seven internal-check failures behave the same way. It also does not prove the frontend and loop evaluators should be considered equivalent on arbitrary inputs: they differed on Kiln's fixed synthetic reference input, whereas PassBench reported equality on its benchmark input.

## Interpretation and decision

For this task, the internal reference check was a false rejection relative to the original PassBench acceptance criterion. That is a measured distinction between two input distributions and evaluation implementations, not evidence of a GPU code-generation bug. The first divergent stage in the internal reference trace is the loop reduction, while PassBench's observed GPU result matched its PyTorch reference.

Keep the ordinary Kiln export gate unchanged for now. Do not add this diagnostic to the normal 53-task/505-graph accepted coverage ledger. A batch replay of the other seven blocked families through the same isolated external evaluator will establish how often the internal gate rejects otherwise accepted programs. If that pattern recurs, add an explicit diagnostic or qualification mode whose receipts distinguish internal-check bypass from normal compilation, and retain PassBench's independent numerical check as the acceptance gate. Any change to the default internal check should be justified by the stage traces and external results, with a separate regression that still rejects a deliberately wrong low-precision program.

## Reproduction and review

Read `scripts/607-task195-no-check-passbench.sh`, the original and diagnostic compiler logs, the original `benchmark.log`, and `score.receipt.json`. The diagnostic source folder contains the exact compiled program, manifest, generated pass, match result, and timing output. The stage localization that motivated this run is in `scripts/604-diagnose-compiler-reference-failures.mjs` through `606-localize-loop-rounding.mjs` and their JSON outputs.
