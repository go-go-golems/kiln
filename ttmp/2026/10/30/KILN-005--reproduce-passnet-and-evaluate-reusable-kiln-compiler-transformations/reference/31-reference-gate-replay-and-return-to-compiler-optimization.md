# Reference-gate replay and return to compiler optimization

## Scope

Eight complete PassBench tasks had stopped at Kiln's synthetic-input frontend-versus-loop reference check. Task195 was replayed separately in reference30. The other seven were compiled with the same source programs, target A100 and separate contraction, adding only Kiln's `--no-check` export flag. The existing integration's declared FX argument normalization remained in use. PassBench's numerical checks and scorer were not changed. These are diagnostic runs, not normal coverage or an unmodified paper-protocol reproduction.

The seven-task run used the two frozen compiler snapshots from the original failed cohorts, the pinned container image `sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba`, NVIDIA GB10, 20 warmups and 100 timed trials. Script608 preserves each task's original generated pass and corpus identity and records an export command for every variant. Script609 audits every graph using PassBench's own log parser and t=-5 correctness decision. The complete raw evidence is in `sources/seven-family-no-check-diagnostic-v1.tar.gz`; the audit and run receipt are materialized beside it for review. Raw per-task logs are in the archive.

The executed copy of script608 had an inaccurate prose `scope` string saying the original evaluator was unchanged. The numerical evaluator and scorer were unchanged, but `evaluate_normalized.py` applies the already declared modified FX matching protocol. The raw receipt is retained, and the corrected audit and this document supersede that wording. The executed script is preserved as `executed-replay.py` in the archive; the tracked script608 has the corrected description. No numerical result was changed by this correction.

## Seven complete-task replay

| Task | Graphs passing exact match, execution and t=-5 | Original scorer output | Main observation |
|---|---:|---:|---|
| 177 | 14/14 | 0.926589 | Internal check rejected one variant; external task accepted |
| 188 | 1/4 | 0.433909 | Three replacements execute but fail strict numerical acceptance |
| 110 | 0/21 | 0.100000 | Older matcher fails to select a pass at pad nodes |
| 36 | 9/9 | 1.049470 | Complete external acceptance |
| 31 | 21/21 | 0.778328 | Complete external acceptance |
| 47 | 12/12 | 2.015122 | Complete external acceptance |
| 146 | 0/4 | 0.100000 | Older matcher fails to select a pass at pad nodes |

All 85 variants compiled with `--no-check`, and all seven evaluator and scorer processes completed. Four tasks and 57 graphs met the audited external acceptance condition. The parser's `eager_fail` label for tasks110 and146 must be read with their logs: the actual exception occurred during compiled-model warmup because `PassMgrBackend` found no matching pass. Eager PyTorch execution was not shown to be defective.

## Newer pad matcher replay

The two frozen compiler snapshots predated the central pad target normalization now present in `integrations/passnet/fx_normalize.py`. To test that specific difference, script612 copied the previously compiled artifacts and passes into a separate directory and ran them through the newer `normalized-matcher-qualification-v1` integration source. This intentionally mixed compiler and matcher snapshots; it is a diagnostic and does not qualify a uniform new compiler release. Script613 applies the same PassBench t=-5 parser to the completed logs.

| Task | Matches | Graphs passing t=-5 and execution | Score |
|---|---:|---:|---:|
| 110 | 21/21 | 20/21 | 0.828999 |
| 146 | 4/4 | 4/4 | 0.930317 |

Task110's graph index3 is the only remaining strict numerical failure in this replay. The 25 successful matches establish that the newer canonicalizer resolves the earlier pad identity mismatch on these two complete families. The complete mixed-snapshot evidence is in `sources/pad-matcher-replay-v1.tar.gz`, with the audit materialized for review and raw benchmark logs inside the archive.

## Decision

The internal reference check is not a reliable proxy for the external acceptance decision on these low-precision programs. Four of seven blocked tasks passed the full external condition under their older matcher snapshots, and task195 passed separately. Conversely, bypassing the internal check did not make every program correct: task188 failed on three variants, and the newer matcher exposed one strict task110 numerical failure. Keep the default internal gate unchanged until its numerical contract is redesigned; keep all bypassed results outside the ordinary cumulative 53-task/505-graph ledger.

This branch of diagnosis is now closed. The next compiler experiment should reuse the existing `transformation_program.mjs`, `compile_policy.mjs`, staged fusion and pointwise interfaces rather than add another evaluator or matcher. A useful experiment is to evaluate a fixed reusable transformation over a larger, already supported graph population, with an unchanged control, exact executable identity, correctness and timing under one declared numerical protocol. The prior staged-fusion thirteen-model confirmation measured 1.146076× with two changed executables; the pointwise agent study measured a 1.021549× development improvement over its fixed composition but no incremental fresh-model transfer. The new population must be declared independently of those observed models. Once that experiment is complete, agent proposals can be compared to the fixed transformation under the same train and held-out split.

The immediate engineering task is to route a `kiln-transformation-program/1` artifact through the existing PassBench corpus compiler without duplicating policy preparation or changing PassBench's scorer. The current policy compiler already prepares and applies these programs for direct graph replay, while `corpus.compile_task` invokes the standard Kiln exporter. Consolidating that boundary will let the same reusable transformation be measured both as a compiler policy and as a PassBench replacement.
