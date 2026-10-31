#!/usr/bin/env python3
"""Record GELU semantics, source provenance and the local validation boundary."""
from pathlib import Path
p=Path(__file__).resolve().parents[1];doc=next((p/'design-doc').glob('17-*.md'));front=doc.read_text().split('---',2)[1]
body='''# Exact GELU source semantics and scalar operation-math lowering

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
'''
doc.write_text('---'+front+'---\n\n'+body)
diary=p/'reference/01-detailed-investigation-diary.md'
entry='''
## Step 136: Implement exact GELU with explicit source and numerical contracts

The next complete import gate adds60 graphs and five complete families:1196 graphs/69 families now translate, with zero regressions across all2060 graphs. Exact source GELU now binds to a shared scalar compiler operation using CUDA erff and an independent JavaScript reference. Both source modes retain their selector; native Kiln's existing tanh default is unchanged. GPU/original-evaluator qualification remains pending.

### Prompt Context
**User prompt (verbatim):** "it's 192.168.0.65 (for bling)"
**User prompt (verbatim):** "you can also just manuel@bling"
See earlier authored implementation, provenance, diary and source-preservation requests in Steps130–135.
**Assistant interpretation:** Restore remote execution through the supplied host identity and continue missing compiler semantics.
**Inferred user intent:** Keep GPU work moving while implementing reusable compiler support rather than hiding unsupported cases.

### What I did
- Inspected the complete importer audit:68 first-blocked graphs use unsupported GELU. Studied official API and pinned CUDA semantics before implementing.
- Added an exact scalar gelu_erf function, independent32-point reference quadrature, explicit GELU selector validation, and source operation-math widening/narrowing.
- Extended the existing argument normalizer with a builtin signature and keyword-only canonical fields; verified real Dynamo versus FX matching and retained approximation predicates.
- Preserved primary documents/license and installed API schemas, independent numerical oracle generation, initial failure and successful test logs.
- Re-audited all200 families, froze every newly complete family, and prepared12 source fixtures for CUDA validation.
- Restored SSH using the user-supplied IP/alias with HostKeyAlias=bling.local; retained strict key verification.

### Why
- PyTorch's default erf-based GELU differs from Kiln's previous tanh approximation. Mapping both to tanh would silently change numerical semantics.
- One source activation must retain FP32 operation math before low-precision output storage; scalar lowering makes this boundary explicit.
- Canonical public defaults are needed for real FX/Dynamo matching, as the earlier softmax failure demonstrated.

### What worked
- All34 compiler test files pass with actual child processes; all52 FX tests pass.
- Independent Python math.erf maximum error2.9976021664879227e-15 across1006 samples; both GELU modes match CPU source oracles at declared dtype tolerances.
- Import1196/2060,69/200 complete families; delta60 graphs/five complete families; no regressions. Frozen cohort includes all60 variants.
- manuel@bling works with the existing bling.local host-key alias. Discovery sees no installed serving binary/model cache/service in its explicitly checked locations, and no running workload container besides the registry.

### What didn't work
- Initial local GELU test: AssertionError expected shape[264], actual[]. T.ew is variadic; passing[x] lifted a scalar. Corrected to T.ew("gelu_erf",x), retained v1 failure log and separate v2 success.
- Direct PyTorch documentation download fails HTTP403 Forbidden; pinned source, license, NVIDIA docs and installed docstring/schema are archived instead, with the failed URL recorded.
- Plain manuel@bling reports ssh_askpass missing and Host key verification failed. Reusing HostKeyAlias=bling.local resolves identity without accepting unknown keys.
- Existing native precision discrepancies remain separate; neither import success nor CPU references establish new GPU/benchmark acceptance.

### What I learned
- Eight of68 first-blocked GELU graphs encounter another missing operation after this binding. First-error counts are upper bounds on immediate coverage gains.

### What was tricky to build
- Builtin GELU lacks inspect.signature support and requires keyword-only selector canonicalization. The normalizer now handles parameter kinds without converting approximation selection into an ignored predicate.

### What warrants a second pair of eyes
- Review exact scalar operation boundaries, quadrature provenance/precision scope, explicit WGSL refusal and actual Dynamo matching tests.

### What should be done in the future
- Commit source/local evidence, run all36 CUDA fixture records and all60 original cohort variants, retaining every failure. Only then update accepted coverage.
- Provision an explicit model runtime/provider for original PassAgent; discovery alone does not configure one.

### Code review instructions
- Start with design17; inspect special.js, fns.js, nn.gelu decomposition, the existing activation importer branch and the argument normalizer.
- Reproduce oracles with script306, local validation with307/310, source delta/complete cohort with309/311, fixture export with312.

### Technical details
- No upstream implementation copied; inspected mathematical/opmath semantics are attributed to the archived PyTorch2.9.1 source and NVIDIA erff API. JavaScript quadrature is independently implemented.
- Original cumulative coverage remains24 tasks/313 graphs pending actual evaluation. No overall-goal completion is claimed.
'''
assert '## Step 136:' not in diary.read_text()
with diary.open('a') as f:f.write(entry)
print(doc)
