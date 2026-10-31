---
Title: Exact GELU source semantics and scalar operation-math lowering
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/fx_import.py
      Note: Source activation mode and operation-math binding
    - Path: repo://integrations/passnet/fx_normalize.py
      Note: Canonical keyword-only selector for FX and Dynamo matching
    - Path: repo://integrations/passnet/test_fx_gelu.py
      Note: Source modes, dtype validation and actual Dynamo matching
    - Path: repo://packages/kiln/src/std/fns.js
      Note: Exact GELU scalar CUDA and reference semantics
    - Path: repo://packages/kiln/src/std/special.js
      Note: Independent JavaScript error-function reference
    - Path: repo://packages/kiln/test/gelu.mjs
      Note: Independent numerical oracle and backend checks
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T07:47:17.273649144-04:00
WhatFor: ""
WhenToUse: ""
---

# Exact GELU source semantics and scalar operation-math lowering

GELU is an elementwise Gaussian error linear unit. PyTorch's public default, approximate="none", computes x/2 times (1+erf(x/sqrt(2))). Its explicit "tanh" mode uses a different approximation. Kiln previously exposed only the tanh form and could not faithfully import the default source operation. The first-blocker audit counted68 graphs at that operator. This design adds the missing mathematical form while preserving the existing native Kiln default.

## Compiler and importer contracts

N.gelu(x, approximate="tanh") now accepts only "none" or "tanh". The existing tanh decomposition stays unchanged. The exact form decomposes to one scalar gelu_erf operation, so its complete arithmetic executes in FP32 registers and only the source result narrows to storage dtype. CUDA emission calls erff. This scalar boundary avoids introducing low-precision rounding between elementary terms of one source activation.

The source importer explicitly selects PyTorch's default "none". Public functional, torch._C._nn and aten.gelu.default forms share the existing activation branch. It validates selector, input/output shape and dtype, widens FP16/BF16 inputs to FP32, invokes N.gelu with the source selector, and narrows the source result. The result grants fresh-storage ownership; the existing single-use mutation rule continues to govern consumers. No kernel delegates back to PyTorch.

The argument normalizer reuses the existing transactional binding path. GELU is a builtin without an inspectable Python signature, so its explicit schema supplies input and the keyword-only approximate selector. Positional fields and keyword-only fields retain separate canonical representations. Filling the default does not erase the none/tanh predicate. Tests compare actual Dynamo capture against symbolic FX and require mismatched selectors not to match.

## JavaScript reference and backend scope

JavaScript has no standard Math.erf. The independent reference integrates the defining Gaussian integral with32-point Gauss-Legendre quadrature. It generates roots/weights by Newton iteration on the Legendre recurrence; no library coefficients or algorithm implementation were copied. For absolute input at least7, erf rounds to the signed unit limit at double precision. Zero, signed zero, infinities and NaN have explicit scalar handling. The measured oracle maximum error is2.9976021664879227e-15 across1006 Python math.erf samples.

CUDA uses the documented erff intrinsic. WGSL has no builtin erf implementation in this compiler. Exact GELU therefore reports explicit WGSL unavailability rather than substituting tanh. This is an implemented CUDA/JavaScript capability with a declared backend limitation. Existing tanh WGSL emission is preserved.

## Source provenance

Script305 archives the pinned PyTorch2.9.1 ActivationGeluKernel.cu, its license, NVIDIA's single-precision mathematical API page and installed public GELU docstring/schema. The PyTorch kernel was inspected for mathematical formulas and FP32 operation-math behavior. Kiln's scalar expression independently implements that mathematics; no upstream kernel, dispatch implementation or polynomial was copied. The quadrature implementation is independent.

The official PyTorch2.9 web page was readable through the web tool but direct HTTP downloading returned403 Forbidden. The failed request is retained in provenance.json; the installed API docstring and pinned implementation supply the archived semantic reference. Source links: https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.gelu.html ; https://github.com/pytorch/pytorch/blob/v2.9.1/aten/src/ATen/native/cuda/ActivationGeluKernel.cu ; https://docs.nvidia.com/cuda/cuda-math-api/cuda_math_api/group__CUDA__MATH__SINGLE.html .

## Validation and gates

The permanent oracle fixture is generated independently by Python math.erf and installed CPU PyTorch2.11.0+cu130. Tests exercise both modes, scalar/source shapes, all three storage dtypes, exact CUDA emission, WGSL refusal, unchanged native tanh default, malformed metadata and selector-specific matching. All34 core test files and52 FX tests pass with real subprocess execution.

An initial test exposed a lowering error: passing [x] to variadic T.ew lifted a scalar constant instead of forwarding the tensor, yielding shape[] instead of[264]. It was corrected to T.ew("gelu_erf",x). The failed log remains gelu-core-validation-v1.log and the successful rerun is separatev2. No checker tolerance was relaxed.

A complete200-task import re-audit reports1196/2060 imported graphs and69 complete families, up60 graphs/five complete families with zero regressions. Eight of the68 first-blocked graphs encounter additional unsupported semantics. Every newly complete family is frozen in gelu-source-cohort-plan.json: five tasks,60 graphs, no dtype/shape filtering. Import eligibility is not original-evaluator acceptance.

Twelve source-derived CUDA fixtures cover scalar, one-element, tail and wide shapes under FP32/FP16/BF16. Each returns exact GELU, tanh GELU and an exact-GELU-plus-one result, checking source rounding boundaries. Three seeds produce36 fixture records. GPU validation and the complete60-graph original cohort remain pending at this checkpoint; no new native coverage is claimed until those gates finish.

## Remote execution identity

The user supplied192.168.0.65 and then manuel@bling after .local resolution failed. IP access with HostKeyAlias=bling.local succeeds. Plain manuel@bling initially failed strict host verification because that alias was not registered; retaining the established HostKeyAlias succeeds without accepting a new unknown key. Scripts308 and the v3/v4 receipts preserve both observations. Existing model/cache/runtime/port discovery finds no provider in the inspected locations, which is not an exhaustive absence proof.

## Native qualification and retained original-cohort failures

All36 source-derived CUDA fixture records pass, comparing108 outputs across three seeds. The complete60-variant original run accepts two families/18 graphs under nominal t=-5, preserving seven matching failures and35 unexecuted graphs from two end-to-end check failures. Independent script325 verifies164 committed source files, all25 successful artifacts, both failed compile attempts, complete membership, scorer/log hashes and all fixture artifact hashes. Cumulative accepted coverage becomes26/200 tasks and331/2060 graphs.

Task151's CPU capture proves a functional LayerNorm argument-form mismatch: symbolic FX retains weight/bias/eps keywords while Dynamo supplies all five positional fields. The existing transactional signature normalizer gains that supported function. Actual-source diagnosis changes from zero to one match without changing tensors, epsilon or replacement code. The complete seven-variant repair plan is frozen separately; its GPU qualification is pending.

The compile-check diagnostic preserves two sparse discrepancies: two of401408 values in the depthwise-convolution/GELU task and five of2047488 in LayerNorm/transpose/GELU. Their origin remains under investigation; FP32 reduction order and narrowing boundaries are hypotheses, not established harmlessness. No compiler/evaluator tolerance or source numerical policy is changed; both families remain unqualified.
