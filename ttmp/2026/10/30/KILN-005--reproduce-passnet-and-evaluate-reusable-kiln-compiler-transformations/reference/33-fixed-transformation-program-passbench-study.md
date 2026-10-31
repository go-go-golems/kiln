# Fixed transformation program on complete PassBench tasks

## Question

Does one reusable Kiln transformation program improve task-level PassBench results relative to unchanged Kiln across complete, heterogeneous task families? This experiment measures compiler-level transfer, not per-graph kernel search.

## Frozen comparison

The population is 12 complete tasks, 92 graphs: zero-based task indices 7, 25, 74, 83, 89, 101, 106, 107, 127, 149, 159, and 165. The exact sample paths, graph counts, and `graph_list.txt` SHA-256 hashes are in `sources/fixed-policy-passbench-v1/baseline-plan.json`. All graphs in each task are included. Task 101 was studied during program development and is a positive control. The remaining 11 tasks are transfer cases, but several have prior Kiln coverage evidence; they are not a pristine unseen benchmark.

The control uses the current Kiln compiler with separate contraction. The candidate adds the fixed `pointwise-fusion-sequence` transformation program copied from the earlier development study. Both arms use the same source snapshot, upstream material, NVIDIA GB10 device, Docker image, A100 scheduling target, warmup count 20, and 100 trials. The A100 target remains a cost-model approximation for GB10. The program is applied at export via the shared transformation-program implementation. Neither arm receives graph-specific tuning.

The optional Kiln internal synthetic reference check is disabled identically in both arms because it has produced false negatives for legitimate exported graphs. PassBench's matching, numerical checking at tolerance `t=-5`, benchmark, and scorer remain active. This is a modified integration protocol, not a reproduction of the untouched paper benchmark. The exact policy bytes are hashed in the run receipt, and the runner refuses compiler source changes during the run.

## Analysis

Report matching and numerical acceptance before latency. Compare complete-task success, graph-level correctness, task score, end-to-end latency, GPU-only latency, and executable identity for the graphs accepted by both arms. Task 101 is reported separately from the transfer aggregate. If a candidate graph fails correctness, retain its failure in the score instead of filtering it from a favorable latency comparison. Do not count a process exit as acceptance.

The main conclusion is about whether this fixed compiler transformation transfers across the declared population. Further compiler changes should follow only after this result identifies a broad pattern worth addressing.
