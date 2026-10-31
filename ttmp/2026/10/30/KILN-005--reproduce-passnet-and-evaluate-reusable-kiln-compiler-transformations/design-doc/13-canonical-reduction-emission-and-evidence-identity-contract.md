---
Title: Canonical reduction emission and evidence identity contract
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/std/kernel.js
      Note: Structural canonical binding before emitted source
    - Path: repo://packages/kiln/src/std/records.js
      Note: Explicit codegen/3 evidence invalidation
    - Path: repo://packages/kiln/test/canonical-emission.mjs
      Note: Fresh-process equivalence and semantic-change separation
    - Path: repo://scripts/run-node-tests.mjs
      Note: Fail closed on child spawn errors
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/canonicalization-v7-replay-verification.json
      Note: Observed failure-population replay without regex or timing changes
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T04:33:27.879581074-04:00
WhatFor: ""
WhenToUse: ""
---

# Canonical reduction emission and evidence identity contract

## 1. Problem and required invariant

The v7 training diagnostic found eight baseline/region-work pairs whose kernel identities were equal and whose CUDA artifacts became equal after renaming generated reduction indices. The exact artifact harness timed those pairs separately. A mathematical kernel identity was therefore stable while its generated source depended on earlier compiler activity.

The required invariant is stronger than a display convention. Given the same computation, schedule, storage types and target, changing the history of globally fresh reduction variables must not change Kernel IR, emitted sources, exported artifacts or evidence content IDs. A real arithmetic change must remain distinct. Historical measurements and rankings remain unchanged; this repair applies to future generated code.

## 2. Retain fresh analysis symbols and bind canonical kernel symbols

Loop IR deliberately creates globally fresh reduction symbols. Inlining and nested reductions use those symbols to avoid variable capture. Removing freshness at expression construction would risk correctness. The expression interner already computes alpha-normalized keys using bound-variable distances, which explains why the mathematical kernel identity can remain stable.

The missing boundary was materialization. `emitNest` and the cooperative row-reduction path used original Loop IR binder names in Kernel IR. They now bind names from the existing structural `displayNames(schedule)` mapping before emitting loops. The map numbers reduction binders by scheduled appearance, independently of the global fresh counter.

```text
Loop IR: globally fresh binders for safe substitution
    -> schedule and analysis with original symbols
    -> materialization binds canonical per-kernel reduction names
    -> Kernel IR
    -> CUDA / WGSL / simulator source
    -> source hash and evidence content ID
```

The original-symbol-to-emitted-symbol environment is retained. Substituting indices uses the original symbol as the lookup key and the canonical loop variable as its value, preserving nested lexical bindings. Scalar temporary naming remains separate from reduction naming. Register-tiled suffixes are applied after reduction canonicalization through the existing context naming hook.

`materialize` creates a shallow analysis view containing the canonical map. It does not mutate cached analysis or schedules. Thread mapping and serial nested reductions use the common binder hook; cooperative row reductions use it explicitly. Tiled contractions retain their fixed k0/kk loops, while any nested reduction emitted through the common path uses the same canonical naming rule.

There is no regular-expression rewrite of executable source and no production semantic-equivalence adapter. The earlier regex diagnostic remains an archived analysis tool only.

## 3. Advance the code-generation boundary

`CODEGEN_VERSION` changes from kiln-codegen/2 to kiln-codegen/3 because the same kernel can now produce different source text. Exported programs carry the new version, and evidence content IDs include it. Existing EvidenceStore rules mark previous-version records stale and nondecisive. The explicit evidence regression now checks the immediately preceding /2 version.

Mathematical kernel identities remain unchanged. That preserves their meaning as computation/shape/storage identities while source hashes represent the canonical executable form. Previous timings are neither retagged nor silently adopted as new-code evidence. The program schema remains kiln-program/1; no new runtime storage or dispatch interface is introduced.

## 4. Test across fresh processes

A same-process alpha-renaming test can pass accidentally because the global expression interner returns the first equivalent expression. The regression therefore compiles in independent Node processes, once with an unused fresh-counter history of zero and once with 97 earlier symbols.

Five cases exercise thread mapping, cooperative row mapping, shared staging, nested reductions and tiled matrix multiplication. Each checks equality of exported artifacts, complete Kernel IR and CUDA/WGSL/simulator evidence content. Each also compiles an actual add-one computation and requires its artifact and evidence to remain distinct. Per-kernel simulation checks verify the emitted programs numerically.

Before the materializer repair, the real regression fails on the first thread case, showing r97 versus r0 in the CUDA loop and address. After the repair the complete cases pass. This is direct evidence of the required invariant, rather than a test of a source-normalization helper.

## 5. Repair the test runner's spawn-error gate

The first attempt exposed an independent harness problem. In the restricted environment, spawnSync returned status zero together with error code EPERM, empty stdout and empty stderr. The old runner checked status and signal but ignored the error field. It could therefore label a test as passing even though no child executed.

The runner now requires the absence of a spawn error, reports its code separately from an exit status, and fails the aggregate gate. A fault-injection test verifies an executed success, a real assertion/exit failure, and a synthetic status-zero spawn error. The fresh-process regression also checks the error field before parsing child output.

All 32 compiler files were executed with actual subprocess permission under the corrected runner. The recorded output contains real file runtimes and the aggregate all-32-passed result. Historical status-only green output is insufficient if child creation was blocked; this discovery does not prove every historical run was blocked. The new boundary supplies direct replacement verification for the current compiler.

## 6. Replay the observed training contrast without changing the experiment

Scripts 217/218 rebuild only the twelve observed v7 training graphs under unchanged and region-work policies. They preserve source, numerical contracts and policy definitions and use normal compilation reference checks. This is bug validation, not new optimization evidence: no GPU timing, confirmation input or reranking is used.

All 24 artifacts compile. Mathematical kernel identities match their previous recorded values. Every one of the eight known name-only contrasts becomes an exact artifact fingerprint alias under /3, without any normalization in the comparison. There were two exact aliases previously; there are now ten aliases and two still-distinct pairs.

This directly checks the actual failure population. It does not claim that every logically equivalent program receives the same identity, nor that the remaining pair differences are useful optimization changes. The separate semantic-change regression ensures the canonical binder mechanism does not collapse a changed computation.

## 7. CUDA validation and remaining scope

The independent three-structure/three-dtype fixture corpus is recompiled under four region objectives, producing 36 codegen/3 artifacts. The same shared CUDA checker will execute 108 three-seed comparisons with unchanged tolerances and input-immutability assertions. GPU validation is pending at this checkpoint.

Scripts 217–222 preserve replay, verification, full validation/fixture compilation, staging, GPU execution and the subprocess capability probe. Primary implementation files are kernel.js, records.js and the corrected run-node-tests.mjs. Tests include canonical-emission.mjs with its isolated worker and node-test-runner.mjs fault injection.

This milestone repairs identity consistency and a validation gate. It does not claim a speedup, add original benchmark acceptance, invoke the original PassAgent, or finish full corpus support. A new optimization study must use a fresh declaration and /3 artifacts; historical v7 timing remains archived under its original protocol and source revisions.


## Completed CUDA validation and next population

All108 canonical-emission CUDA comparisons pass on GB10. The original v8 source attempt and a quota-preserving retry after binding torch.transpose both stop with ten reduction/five matrix graphs. Both partial attempts remain archived. A new explicit source declaration scans all4476 official training tasks and allows up to64M matrix scalar products, retaining other bounds, quotas and exact-model exclusions. It fills twenty sources after2438 tasks; membership c40f81bf05839042fd845dc797a6ddb3b8665d1f3d7b27f83cc5fb4d9cc27ca5. No policy timing or confirmation compilation is used to revise that source population.

The transpose binding is unified across method/function/ATen forms with metadata and alias checks. Thirty-nine independent fixtures compile after fixing input-only export detection: no-op scalar/vector views can be complete programs with zero kernels. Their CUDA execution remains pending at this checkpoint. The full import audit stays1029 graphs/51 families; original acceptance remains eleven tasks/206 graphs. Documented provider settings are absent locally and on bling, and the model/endpoint question is pending while independent compiler work continues.
