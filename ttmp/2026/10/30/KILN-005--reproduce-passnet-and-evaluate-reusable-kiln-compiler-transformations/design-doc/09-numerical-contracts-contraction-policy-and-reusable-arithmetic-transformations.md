---
Title: Numerical contracts contraction policy and reusable arithmetic transformations
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/std/emmy.js
      Note: Opt-in separate-rounding pipeline policy
    - Path: repo://packages/kiln/src/std/fns.js
      Note: Protected FP32 scalar operations and CUDA intrinsics
    - Path: repo://packages/kiln/test/contraction.mjs
      Note: Exact semantic oracle and unchanged-default control
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T01:56:14.384311442-04:00
WhatFor: ""
WhenToUse: ""
---

# Numerical contracts, contraction policy and reusable arithmetic transformations

## 1. Define the contract before optimizing arithmetic

Kiln's frontend, loop reference and emitted device program must agree about which arithmetic boundaries are observable. A floating storage dtype does not by itself specify every intermediate operation. FP16/BF16 source operators commonly widen internally, while a later storage conversion can make a small FP32 difference observable as a whole low-precision step.

The implementation distinguishes two policies for elementary tensor addition, subtraction and multiplication. `allow` retains existing Kiln optimization and CUDA compilation behavior. `separate` preserves a distinct FP32 rounding boundary for each of those operations. Both policies retain the original source graph's storage casts. Neither policy claims bitwise equivalence with every opaque PyTorch operator, a particular cuBLAS algorithm, transcendental implementation or parallel reduction order.

This is a compiler policy, not a benchmark tolerance change. The original evaluator still decides correctness using its declared curve; nominal coverage still requires t=-5, successful execution and exactly one replacement. The original scorer keeps p=0 and fpdb=0.1.

## 2. The failure has two different causes

The first defect was in the JavaScript loop reference. It kept double intermediates between scheduled operations. For FP32 `(100000000 + 1) - 100000000`, the frontend and actual CUDA return zero while the old reference returns one. Shared FP32 scalar and reducer tables now round results and accumulator updates in full serial and sampled point references. Literal arguments are rounded before evaluation/folding without changing their stored spelling. This correction is committed as ed8bea9 and validated by the exact CUDA oracle.

A second difference remains even with a correct FP32 reference. FMA computes a product plus an addend with one final rounding, whereas a separate product and sum have two roundings. On the preserved BF16 CoAtNet case, explicit contraction produces eight compiler-check mismatches among 802816 outputs. Removing only contract_fma makes the frontend and loop outputs identical on those same synthetic inputs. That diagnostic identifies a rounding boundary; it does not prove that CUDA will refrain from contracting ordinary expressions or that no-contraction reproduces native PyTorch.

## 3. Represent protected operations in scalar IR

The opt-in policy adds `frontend/separate-rounding` after decomposition and before frontend optimization:

```text
source nn operations
  -> decomposition to tensor primitives
  -> optional separate-rounding pass
  -> ordinary frontend optimization
  -> loop lowering and fusion
  -> scheduling and kernel materialization
  -> CUDA emission
```

The pass rewrites `add`, `sub`/`subtract` and `mul`/`multiply` to `add_rn`, `sub_rn` and `mul_rn`. The existing FMA contraction rule matches ordinary add/mul and therefore cannot contract protected operations. Explicit source FMA remains an explicit FMA. A separate policy does not rewrite a deliberate fused operation into an unfused one.

The protected functions live in the same FNS table as other scalar operations. Their JavaScript implementations round operands and results to FP32; their CUDA templates use __fadd_rn, __fsub_rn and __fmul_rn. [NVIDIA documents these intrinsics](https://docs.nvidia.com/cuda/archive/13.1.1/cuda-math-api/cuda_math_api/group__CUDA__MATH__INTRINSIC__SINGLE.html) as retaining their individual operation rather than merging into multiply-add. The instruction selection is carried in emitted code, so it survives the unchanged runtime compiler flags.

```javascript
std.emmy.pipeline({target, contraction: "separate"})
```

Loop expressions include the protected function names in their structural keys. Kernel identity therefore distinguishes protected arithmetic from ordinary arithmetic. No separate runtime flag, launcher-specific override or hidden cache setting is required. Existing default identities remain unchanged.

## 4. Backend guarantees must remain explicit

The current implementation provides the protected-operation guarantee for CUDA. It does not provide an equivalent WGSL implementation. A kernel containing a protected scalar operation therefore has no WGSL source and carries a clear unavailable reason. Direct WGSL emission rejects it as well. This is checked on FP32 storage so that the arithmetic limitation cannot be confused with the pre-existing FP16/BF16 storage restriction.

The generic unavailable-reason helper replaces the former storage-only helper. Existing call sites use the new name directly; no compatibility alias is introduced. Default programs without protected operations retain their existing WGSL path.

Separate rounding can change scheduling opportunities. A matrix materializer that recognizes ordinary multiplication may no longer recognize a protected product. That can be necessary when its fused accumulation would violate the selected boundary. Performance consequences must be measured, and a later optimization may recover a fast implementation only when it preserves the declared contract.

## 5. Use the same policy through compiler entry points

The standard pipeline accepts `contraction: "allow" | "separate"`, defaulting to allow. The workbench compile helper and export CLI accept the same option:

```bash
node scripts/kiln-export.mjs \
  --script graph.kiln.js --target a100 \
  --contraction separate --out graph.json
```

An explicit CLI policy requires the standard pipeline; it rejects a conflicting custom project pipeline rather than silently overriding it. Custom pipeline users can construct the desired standard pipeline explicitly before composing further passes.

The export's source provenance records an explicitly selected contraction policy alongside path and source SHA. The executable guarantee itself is present in the CUDA and scalar expression. Metadata alone is not treated as a different executable. Existing policy qualification removes source metadata before checking executable aliases, so otherwise identical code can still share timing evidence.

The corpus compiler exposes `--contraction` and the shared complete-task runner reads it from the frozen plan. Every phase command and source snapshot remains recorded. No matcher, input allocation, reference domain or scorer behavior changes as part of selecting this policy.

## 6. Validate the contract with exact oracles

The core regression uses FP32 a=1+2^-23, b=1-2^-23 and c=-1, with BF16 output. The exact product before rounding is 1-2^-46. Separate multiplication rounds to one and the sum returns zero. FMA retains -2^-46, which BF16 can represent.

This example checks the complete distinction without relying on broad tolerances. Tests require the frontend and separate loop reference to return zero, the allowed-contraction loop to retain the small difference, and generated protected CUDA to contain the round-to-nearest intrinsics. Explicit allow must have the same kernel identities as the existing default. A constant-folding case additionally verifies that nonrepresentable literal operands are rounded at their FP32 input boundary.

The CUDA fixture compiles the same program in both modes with unchanged NVRTC defaults, invokes both through the existing PyTorch bridge and asserts their different exact answers. This is a one-element semantic oracle, not an estimate of benchmark-wide accuracy or performance.

The complete core test boundary and the existing Python integration suite are required before a broader task run. The exact preserved CoAtNet source is also compiled with ordinary end-to-end checking enabled. Benchmark tolerance changes, no-check flags and custom output comparisons are not part of this qualification.

## 7. Qualify existing failures before making an optimization claim

The next complete-task experiment includes every member of the four previously compile-blocked families: task indices 51,60,82,182, totaling 63 graphs. The first source-domain run and subsequent allocation/precision diagnostics remain preserved. The new run selects separate rounding explicitly and retains all original graph membership, replay inputs and official scoring.

These are already observed evaluation tasks. They are a development/qualification cohort, not a fresh held-out optimization result. Successful compilation would establish progress through one gate; complete task acceptance still requires all original variants. Runtime numerical failures, eager-source failures and unexecuted variants must remain visible.

The source numerical contract is also distinct from native library equivalence. The archived PyTorch normalization source performs its own widened expression and may itself be compiled with contraction. A decomposition that preserves its own elementary boundaries can still disagree with that opaque implementation. Native BF16 matrix reduction settings and transcendental approximations are additional independent factors.

## 8. Connect the feature to reusable self-optimization

The existing fusion studies already implement training-only generation, frozen selection, changed-artifact qualification and confirmation measurement. A numerical contract should be fixed across a future study's baseline and candidates. An agent may search legal implementations within that contract; it must not obtain reward merely by weakening the contract or the evaluator.

Separate arithmetic also creates a concrete new transformation problem: identify cases where contraction is provably equivalent, then decide whether it is profitable. General contraction across a low-precision cast is not such a proof. Recovering it needs operand facts, exact-product conditions or an explicit source-level permission. The compiler currently lacks the complete range/effect analysis needed for broad automatic relaxation, so this feature does not claim that capability.

A useful next experiment can instead hold separate rounding fixed and broaden fusion/scheduling interventions on newly qualified matrix and normalization workloads. That preserves the distinction between semantic legality and profitability while avoiding another search over policies that all produce the same executable.

## 9. Provenance and review references

The implementation is independent. Primary NVIDIA documentation and pinned PyTorch v2.9.1 normalization sources are archived under sources/numerics with URLs, byte counts and SHA256 hashes. No PyTorch normalization implementation was copied. The native sources establish why matching a mathematical formula does not establish equality with an opaque operator's internal rounding.

Review std/fns.js, std/tensor.js, std/emmy.js, std/emit.js, std/program.js, the workbench compile helper and export CLI. The core contraction test checks identities, semantics and backend refusal. Ticket scripts 152–156 preserve source acquisition and exact CPU/CUDA validation. Subsequent complete-task receipts own benchmark acceptance; this document owns the numerical-policy design.


## 10. Measured qualification result

All 63 declared variants compile and reach original evaluation/scoring under separate rounding. Nominal acceptance is 62/63, with three complete tasks: 51 (4/4),60 (44/44),182 (9/9). Task 82 remains 5/6, preserving one BF16 failure at t=-5. The cumulative ledger reaches 11 complete tasks and 206 individually passing graphs after overlap accounting. These are development qualification results, not a fresh held-out optimization experiment.

The exact measured source snapshot has 89 files: 85 match a620e6e, and four archived overrides reconstruct the actual remote state. CUDA/shared-runtime ASTs match the commit when the unrelated WebGPU class and documentation are excluded. Future sources are aligned separately; earlier evidence is not rewritten. Script 161 verifies this provenance and the reported numerical facts.

The structural training audit finds zero reductions, fanout or exact internal duplicates in the old 12-graph development set. Broader transformation learning therefore requires a deliberately richer corpus rather than another policy on this unchanged workload population.
