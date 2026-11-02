# Fixed transformation program: complete-task PassBench result

## Experiment

One fixed `kiln-transformation-program/1` pointwise-fusion sequence was compared with unchanged Kiln on 12 declared complete PassBench tasks (92 graphs). The task membership and program bytes were frozen before compilation. Both arms used the same compiler source snapshot (`7557de52462180c4f7ab5dd246b7ee554fcc55480e880ae0a82f189a9772a740`), pinned image, NVIDIA GB10, A100 scheduling target, separate contraction, 20 warmups and 100 timed trials. The existing FX argument-normalization integration was active. Kiln's internal synthetic reference check was bypassed equally in both arms; original PassBench matching, numerical check at `t=-5`, and scorer remained active. This is a modified integration protocol and a sequential control-then-candidate comparison.

Task101 was previously used to develop the fixed program. The other 11 tasks are transfer cases, though some had earlier Kiln coverage work and are not a pristine unseen benchmark.

## Audited result

The shared task auditor verified all 12 tasks and all 92 graphs in **both** arms: exact membership, one replacement, execution, and nominal numerical acceptance. The candidate changed 49 executable artifacts. There are no correctness losses in this population.

| Task | Graphs | Changed executables | Baseline score | Candidate score | Baseline / candidate end-to-end latency on common-correct graphs |
|---:|---:|---:|---:|---:|---:|
| 7 | 2 | 0 | 0.728623 | 0.728373 | 1.00243× |
| 25 | 6 | 6 | 0.800978 | 0.264049 | 0.32960× |
| 74 | 6 | 0 | 0.842079 | 0.844520 | 1.00223× |
| 83 | 3 | 3 | 0.267300 | 0.745281 | 2.78012× |
| 89 | 9 | 0 | 0.867723 | 0.870701 | 1.00251× |
| 101, development control | 6 | 6 | 0.012313 | 0.404608 | 32.78202× |
| 106 | 6 | 6 | 1.384487 | 1.149263 | 0.82701× |
| 107 | 18 | 18 | 0.242812 | 0.243267 | 1.00238× |
| 127 | 6 | 4 | 0.410529 | 0.411602 | 1.00297× |
| 149 | 18 | 0 | 1.563851 | 1.570377 | 1.00244× |
| 159 | 6 | 6 | 1.154407 | 1.144046 | 0.99598× |
| 165 | 6 | 0 | 1.074896 | 1.080120 | 1.00541× |

Across the 11 transfer tasks, the arithmetic mean of official per-task scores falls from **0.848880 to 0.822873**. The task-family-balanced geometric mean of baseline/candidate end-to-end latency is **0.976551×** on common-correct graphs. For transfer families with changed executables, that ratio is **0.955492×**. These are descriptive paired-run statistics; the arithmetic mean of task scores is not itself a published PassBench aggregate. The control task101 is excluded from those transfer summaries.

The dramatic win on task101 repeats the development observation, and task83 also gains strongly. Task25's six variants regress enough to reverse the transfer aggregate. Thus, the fixed program should **not** become a global default. The result supports studying a selective compiler policy conditioned on actual workload features, alongside other strategy classes; it does not yet prove that an agent can discover such a policy and generalize it.

Some changed artifacts have near-identical timing, and unchanged artifacts show small timing differences. The task table does not interpret those differences as optimization effects. The run order could cause drift; a later near-threshold candidate should be interleaved or repeated before promotion. This result is sufficiently decisive to reject global adoption of the fixed program without another timing run.

## Reproducibility

The declared plans, fixed policy, source staging receipt, both task audits and graph-level comparison are in `sources/fixed-policy-passbench-v1/`. All 1,157 raw evidence members (source programs, compiled artifacts, generated passes, PassBench logs, scorer receipts and run manifests) are in `raw-evidence.tar.gz`, SHA256 `efbe9a10d0738a0b7635c947a07592f83039ef6e7138869a5174172fd967fed4`. Scripts615–619 freeze, stage, collect and analyze the run. Reference34 uses this result to define the next coverage and optimization waves.
