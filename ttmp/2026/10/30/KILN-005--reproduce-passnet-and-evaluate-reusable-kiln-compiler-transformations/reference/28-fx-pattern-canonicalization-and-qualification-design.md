# FX pattern canonicalization and qualification

PassBench matches a Python pass's `pattern` against the `torch.fx.GraphModule` produced by TorchDynamo. Kiln currently derives the pattern from a dataset model's `forward` method, while the evaluator captures the target graph through `torch.compile`. These two paths can represent the same call differently. This document states the narrow integration contract and the evidence required before a task is counted as supported.

## Where the graphs come from

`integrations/passnet/generate_pass.py` extracts a Python pattern from a trusted dataset `GraphModule.forward`, traces it with FX, and records the pattern identity for each task variant. The generated replacement invokes the compiled Kiln artifact through `CorpusDispatch`. The code under `sources/upstream/pass_bench/torch/backend/pass_mgr_backend.py` applies each pattern with the original subgraph matcher and rejects a compiler run if no pass modifies the graph.

`integrations/passnet/evaluate_normalized.py` is the declared modified integration protocol. It substitutes a `NormalizedPass` that canonicalizes pattern and target arguments before invoking the original matcher. It does not replace the matcher, alter the correctness curve, or change the generated CUDA executable. The normalization code is centralized in `integrations/passnet/fx_normalize.py`; operator-specific call-form exceptions belong there rather than in generated passes or dataset copies.

## A concrete mismatch

The task107 model contains a convolution followed by `torch.nn.functional.max_pool2d`. FX tracing of the source pattern records:

```text
max_pool2d(conv, 3, stride=2, padding=1, dilation=1,
           ceil_mode=False, return_indices=False)
```

TorchDynamo captures:

```text
max_pool2d(conv, 3, 2, 1, 1,
           ceil_mode=False, return_indices=False)
```

The same callable and values are present, but FX stores `args` and `kwargs` separately, so structural matching initially finds zero matches. The `boolean_dispatch` wrapper has only a variadic Python inspection signature. The integration therefore declares the seven public `max_pool2d` parameters explicitly, binds both call forms, fills defaults, and writes the same canonical positional argument list. A local capture yields one subgraph match. A full task107 PassBench replay then accepts all18 graph variants at the original t=-5 numerical threshold, with aggregate score0.24265578547986374. The score measures speed and correctness together; acceptance does not establish speedup over eager.

The same census found `hardtanh` arguments split between positional and keyword forms. Its inspectable public signature suffices. For padding, source FX calls `torch.nn.functional.pad` while TorchDynamo captures `torch._C._nn.pad`; the integration binds the same four parameters and canonicalizes the target identity to the latter. A first-graph structural census moves from four to nine matches across nine previously unmatched families. Complete-family GPU replay is still required for the eight additional families.

## Canonicalization contract

For every supported call, the canonicalizer must:

1. Identify an exact callable or a specific pair of semantically equivalent callables. Never match by a broad name substring.
2. Bind positional and keyword arguments to an explicit signature, rejecting duplicates, unknown names and missing required arguments before any graph mutation.
3. Apply only public defaults and preserve literal values such as stride, padding mode, `inplace`, dtype and approximation choice.
4. Rewrite both source pattern and target graph into the same call representation. If target identity changes, record it in the normalization receipt.
5. Keep the result idempotent and preserve the graph's computation. A changed semantic parameter must still produce zero matches.

For a new operator, the first test should capture a representative TorchDynamo graph and compare its target, `args`, `kwargs`, output structure and placeholder order with the source pattern. A focused regression test should show zero matches before normalization, one match after, equal output, idempotence, and rejection of a changed parameter. Then replay a *complete* PassBench family under a committed compiler snapshot.

## Qualification and attribution

An import audit establishes only that `fx_import.py` can represent a graph in Kiln. A local matcher check establishes only structural compatibility for the captured case. Native CUDA fixtures compare the compiled operator against PyTorch on selected inputs. None alone proves benchmark support.

The acceptance ledger in `scripts/21-build-coverage.py` reads terminal original-evaluator logs. A graph counts only when compilation and execution succeed, exactly one replacement is applied, and the original numerical check at t=-5 passes. A task counts only when every graph in its frozen `graph_list.txt` counts. This matters because task52 has nine executed, matched graphs but only five meet t=-5; the task remains unsupported. Likewise, an earlier16-family replay imported all158 graphs but only three complete families passed. Its failure taxonomy separates no-match cases from compiler failures and unexecuted graphs.

Each replay records its source revision, a SHA256 snapshot of all compiler/integration files, the pinned image digest, full task membership, process receipts, per-graph logs, scorer output and a compact acceptance audit. The cumulative ledger intentionally combines evidence from different source snapshots and labels that limitation. A uniform release claim would require rerunning all200 task families from one frozen compiler revision and environment.

## Next implementation questions

The current matcher work is concentrated in one normalizer module. This avoids a separate normalization rule in every generated pass. The next diagnostic should inspect the eight-family replay and distinguish residual structural mismatches from numerical or compile failures. Task52's low-precision linear arithmetic is a separate numerical issue: outputs derived from `linear` fail the strict threshold on four graphs, while the device-only forwarded output is exact. A safe change needs an operation-order and dtype comparison against the pinned PyTorch implementation, followed by a fixed-tolerance replay. Placeholder in-place hardtanh remains rejected because the current importer cannot prove mutation and alias semantics; canonicalizing the match pattern does not grant that permission.

## Evidence

- `sources/pattern-target-fx-diagnostic-v1.json` and `v2.json`: task107 before and after max-pool argument normalization.
- `sources/failed-fx-pattern-census-v1.json` and `v2.json`: nine-family structural census before and after pad/hardtanh normalization.
- `sources/max-pool-match-task-audit-v1.json`: full task107 acceptance.
- `sources/parallel-port-task-audit-v1.json`, `parallel-port-delta-task-audit-v1.json`, and `kiln-coverage.json`: broader evaluation outcomes.
- `scripts/592-diagnose-pattern-target-fx.py`, `593-check-max-pool-normalization.py`, `598-census-failed-fx-patterns.py`, and `599-check-pad-hardtanh-normalization.py`: repeatable local diagnostics.
