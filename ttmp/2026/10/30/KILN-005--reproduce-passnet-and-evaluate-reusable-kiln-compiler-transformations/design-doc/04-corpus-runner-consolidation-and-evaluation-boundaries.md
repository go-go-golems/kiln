---
Title: Corpus runner consolidation and evaluation boundaries
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/check_corpus_cuda.py
      Note: Complete recursive output correctness checks
    - Path: repo://integrations/passnet/corpus.py
      Note: Shared manifest-driven export and compilation
    - Path: repo://integrations/passnet/evaluate_normalized.py
      Note: Explicit original-evaluator integration hooks
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-30T21:48:17.702218525-04:00
WhatFor: ""
WhenToUse: ""
---

# Corpus runner consolidation and evaluation boundaries

The first integration experiments used numbered task-specific scripts. They made every intervention inspectable, but repeated the same export, compilation and correctness loops. Continued expansion to 200 tasks would multiply those loops and allow their semantics to drift. The numbered scripts remain historical evidence; new experiments should invoke shared integration commands.

## Ownership

| Component | Owns | Must not own |
|---|---|---|
| `corpus.py` | Trusted source loading, FX export, manifest validation, compilation receipts | Matching policy, scores, numerical tolerance changes |
| `fx_export.py` / `fx_import.py` | Typed interchange and explicit semantic lowering | Benchmark success decisions |
| `check_corpus_cuda.py` | Every output's shape, dtype and numerical comparison against source | Timing or official acceptance |
| `runtime.py` | Storage, streams, lifetimes and invocation | Pattern matching or optimization decisions |
| `evaluate_normalized.py` | Explicit integration protocol hooks into upstream evaluator | Silent guard removal or replacement metrics |
| Coverage builder | Exact task/graph accounting from evaluator evidence | Inferring support from operator lists |

The `kiln-passnet-corpus/1` manifest carries source graph identity, script filename, ordered inputs/dtypes and output structure. Compilation records one result per graph. Correctness requires the complete compile receipt with matching identities and artifact names. The checker recursively reconstructs tuple/list/dict outputs, so an experiment cannot accidentally check only the first result.

```text
pinned task list -> corpus export -> typed manifest + Kiln source
                                         |
                                   corpus compile
                                         |
                          artifact + complete compile receipt
                              /                        \
                  shared CUDA checker            PassBench evaluator
                  source comparison             correctness + timing + score
```

## Pattern tracing and multiple outputs

Dynamo preserves source `operator.iadd`; standard FX symbolic tracing of `+=` falls back to ordinary addition. `trace_pattern` uses FX's explicit autowrap facility for a directly imported `operator.iadd`. It preserves the source target identity and performs no graph arithmetic rewrite. Generated pass files do not call module-level `torch.fx.wrap`, which upstream AST validation rejects. Protocol identity: `kiln-pattern-autowrap/1`.

The standard backend emits a single opaque replacement output even when a pattern returns two tensor nodes. The pinned upstream file `pass_bench/torch/backend/pass_mgr_direct.py` already implements `FixedPatternReplacementPass._make_multi_output_replacement`, which destructures a guarded tuple result through individual getitem nodes. The integration imports that helper directly; no implementation is copied. Its callable comes from the standard backend, retaining its original dispatch wrapper. Protocol identity: `kiln-pattern-multi-output/1`. These additions are modified integration behavior and are not an unchanged paper reproduction.

## Commands

```bash
python integrations/passnet/corpus.py export --upstream DATASET --sample TASK --output ARTIFACTS
python integrations/passnet/corpus.py compile --directory ARTIFACTS --kiln KILN --target a100
PYTHONPATH=runtime/python python integrations/passnet/check_corpus_cuda.py \
  --directory ARTIFACTS --upstream DATASET --inputs random --include-path /usr/local/cuda/include
```

The checker also supports explicit original input replay. Random and replay receipts are separate. Neither establishes performance. All input modules are trusted executable Python; this is not a sandbox for arbitrary downloaded code.

## Remaining consolidation

Pass generation and evaluator invocation still have task-specific drivers. They should next become declarative pattern/replacement specifications and shared experiment commands after input binding and multi-output semantics are verified. Do not embed task hashes inside compiler lowering. The importer is still small enough to inspect directly; split operator families when semantic ownership becomes unclear, rather than adding generic fallback behavior.
