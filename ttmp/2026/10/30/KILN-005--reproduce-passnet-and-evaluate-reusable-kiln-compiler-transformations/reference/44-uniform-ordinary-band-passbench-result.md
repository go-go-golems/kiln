---
Title: Uniform ordinary-band PassBench qualification result
Ticket: KILN-005
Status: active
Topics: [kiln, passnet, compiler-optimization]
DocType: reference
Intent: near-term
Owners: []
RelatedFiles: [integrations/passnet/summarize_task_run.py, integrations/passnet/dispatch.py, integrations/passnet/generate_pass.py]
ExternalSources: []
Summary: Audited result for the first 56 tasks and 561 graphs of the frozen uniform qualification
---

# Uniform ordinary-band PassBench qualification result

## Scope and protocol

This is the **first terminal band** of the 111-task/1,514-graph uniform qualification declared in [reference36](36-uniform-importable-task-qualification.md). It contains 56 previously unverified complete task families and all 561 graph variants in their frozen source lists. The other two bands, two large families/522 graphs and 53 regression families/431 graphs, were still pending or running at collection; this document makes no combined 111-task acceptance claim.

The frozen staged compiler revision is `0c17cee0b0874341828af2e0945890ccd51cece4`, source snapshot SHA256 `7557de52462180c4f7ab5dd246b7ee554fcc55480e880ae0a82f189a9772a740`. The modified FX matcher integration, original PassBench numerical checker and scorer, NVIDIA GB10, A100 scheduling proxy, separate contraction, 20 warmups and 100 timed trials were used. Kiln's internal synthetic reference check was explicitly bypassed; external numerical checking remained active. This is **modified integration protocol** evidence, not an untouched reproduction of the paper baseline.

## Audited outcome

The collector compared the terminal `run.json` plan with the committed frozen plan and source snapshot. `summarize_task_run.py` then checked all 56 task records against each source `graph_list.txt`, exact graph order, duplicate entries, replacement count, execution status and original correctness curve at `t=-5`. No graph was unexecuted and all 56 tasks have complete evidence.

| Measure | Result |
|---|---:|
| Declared task families | 56 |
| Declared graph variants | 561 |
| Fully accepted families | **32** |
| Individually accepted graphs | **479** |
| Unexecuted graphs | 0 |
| Graphs with a dispatch specialization miss | 16 |
| Graphs where no replacement matched | 21 |
| Graphs where the matcher rejected a dead-code pattern | 2 |
| Executed/matched graphs failing nominal numerical tolerance | 43 |

The 32 families are accepted only on this frozen snapshot. The prior historical 53-family ledger uses different source revisions; the numbers must not be added or described as a uniform current result. The 24 incomplete families include one with both a dispatch miss and numerical failures. Every one of the 43 nominal numerical failures passes at the loose `t=1` point; 26 pass at `t=-4` and 40 at `t=-3`. Those looser points are diagnostic, not acceptance.

## Failure clusters and immediate implications

**Dispatch specialization, 16 graphs in tasks 6, 24 and 185.** The original evaluator applied one Kiln replacement, then `CorpusDispatch` raised `ValueError: No compiled program for input metadata and constants`. Examples include an extra integer specialization value. Tasks 6 and 24 otherwise have no nominal numerical failures in this band, so repairing their specialization binding could complete two families without a new GPU algorithm. Task185 also has numerical failures. Review `integrations/passnet/dispatch.py` against `generate_pass.py` and the source call signatures before changing cache-key logic.

Script657 establishes the concrete mismatch: **all16 failing graphs applied a different generated pattern ID than the one recorded for their compiled manifest variant**. Four pattern-pair collisions account for the failures: task6 IDs `3→9` (six graphs) and `4→10` (seven), task24 `0→1` (two), and task185 `2→3` (one). Inspecting the source-derived pattern bodies shows the paired patterns contain the same main computation with a different tuple return order (and sometimes source no-op assignments). The current generated-pass ordering admits a pattern with compatible computation but the wrong output identity. A bare dispatch-key fallback by input metadata would risk returning outputs in the wrong order. The repair must make match identity and output ordering agree, then replay these complete families through the original checker. The per-graph applied/compiled IDs and return expressions are preserved in `sources/uniform-importable-qualification-v1/pending-ordinary-pattern-collisions.json`.

**FX matching, 23 graphs in tasks 79 and 128.** Task79's 21 variants report `[PassMgrBackend] No passes modified the graph`; task128's two variants report `SubgraphMatcher cannot be initialized with an pattern with dead code`. Neither result supports a conclusion about the quality of the compiled CUDA. Compare the source FX pattern, generated pass module and normalized TorchDynamo graph. A matcher repair may complete these two families if numerical correctness then passes; that is a hypothesis, not a measured result.

**Numerical behavior, 43 graphs across 20 families.** These variants applied exactly one replacement and executed, but failed the original nominal tolerance. The failures span FP32, FP16 and BF16 and may involve different operations. They should be clustered by source operation and precision mechanism before changing a global tolerance or arithmetic policy. The full graph list and tolerance curve remain in the failure-summary JSON.

The two integration clusters are potentially high-yield repair work while an expert reviews the broader architecture. They should be fixed at the shared matcher/dispatch boundary, not by silently excluding variants. The numerical cluster needs source-specific investigation with the pinned original checker.

## Evidence and reproduction

- `sources/uniform-importable-qualification-v1/pending-ordinary-plan.json`: frozen membership.
- `sources/uniform-importable-qualification-v1/pending-ordinary-audit.json`: per-task and per-graph acceptance decision.
- `sources/uniform-importable-qualification-v1/pending-ordinary-failure-summary.json`: diagnosed failure classes, dtypes, task IDs and source graph paths.
- `sources/uniform-importable-qualification-v1/pending-ordinary-pattern-collisions.json`: exact applied-versus-compiled pattern identities and output expressions for all16 dispatch failures.
- `sources/uniform-importable-qualification-v1/pending-ordinary-collection.json`: source revision, result counts and hashes.
- `sources/uniform-importable-qualification-v1/pending-ordinary-raw.tar.gz`: all 56 task directories, generated passes, compiled artifacts, evaluator logs and scorer files. SHA256 `61b55928009b4ecdc809c943dd76e2d9f59f178d5595015327075481ff5282a0`.
- Scripts655–657 in the ticket `scripts/` directory collect/audit, classify and diagnose pattern collisions. Re-running them against the same terminal remote evidence should reproduce the summaries. Script655 refuses to overwrite an existing local collection.

The ordinary band is not a performance comparison against TorchInductor or an optimization-policy result. Its scorer receipts are preserved for later corpus-level reporting. The remaining uniform bands must finish and receive the same membership/numerical audit before stating current-snapshot total coverage.
