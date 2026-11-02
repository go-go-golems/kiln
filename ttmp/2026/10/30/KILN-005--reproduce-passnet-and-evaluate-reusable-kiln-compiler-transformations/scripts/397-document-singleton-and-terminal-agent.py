#!/usr/bin/env python3
"""Document source binding and audited terminal results without changing history."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];facts=json.loads((p/'sources/original-agent-smoke-terminal-v1/verified-facts.json').read_text());delta=json.loads((p/'sources/singleton-view-import-delta.json').read_text());assert len(delta['newly_imported'])==55 and len(delta['newly_complete_tasks'])==7
with (p/'design-doc/15-singleton-reshape-index-maps-and-contraction-visibility.md').open('a') as f:f.write('''

## Source singleton insertion and removal

The shared indexing binder now handles Tensor/public/ATen unsqueeze and squeeze using the existing N.reshape operation. For rank r, unsqueeze accepts an integer axis in [-r-1,r], normalizes it modulo r+1, and inserts a size-one dimension. Squeeze without dim removes every unit dimension. An explicit integer or list/tuple removes only selected unit dimensions; selected non-unit dimensions remain unchanged. Negative axes are normalized against max(1,r), preserving scalar dim0/-1 no-op behavior. Duplicate normalized axes, Boolean/noninteger axes, invalid ATen overload forms and inconsistent result metadata are rejected. An empty axis list removes nothing. Explicit dim=None is rejected, following the installed source behavior rather than confusing it with an omitted argument.

The binder reuses lower_reshape for exact output shape/dtype and element-count checks. It does not add a compiler operation or transfer fresh-storage ownership through a view. Consequently, an in-place operation after an imported view remains rejected by the existing conservative ownership checks. This is value-semantic lowering within the existing integration contract; it does not implement observable cross-output storage aliasing.

Source lookup is consolidated in one operand_spec helper used by matrix, normalization and singleton binding. The view semantics remain in fx_indexing.py instead of creating another parallel layout module. Public, method and ATen spellings emit identical scripts for equivalent calls. FX/Dynamo matching tests pass without extending the argument normalizer.

Primary contracts are archived in sources/singleton-view-semantics-v2, including PyTorch v2.9.1 _torch_docs.py (SHA256 d7e78bf42ec9b005c7e1bc7b752244e94442c9ccc8a2abed546234723a0533dd), installed docstrings, exact schemas and121 independent source probes under Torch2.11.0+cu130. The implementation is independent dimension arithmetic over existing Kiln primitives; no PyTorch implementation was copied. Official documentation pages were inspected, but direct download returned HTTP403; the tagged upstream docstring source was downloaded instead.

All57 FX tests pass. The complete200-task import audit increases eligibility from1196/69 to1251 graphs/76 complete families with zero import regressions. Every newly complete family is frozen in singleton-view-source-cohort-plan.json: seven tasks and55 variants, without shape/dtype filtering. This is translation eligibility only; native CUDA fixture validation and original evaluator acceptance remain required. Current accepted replay remains27 complete tasks and338 individual graphs.
''')
with (p/'design-doc/18-original-passagent-on-a-pinned-local-model-with-complete-evaluation-membership.md').open('a') as f:f.write('''

## Terminal shipping smoke and reward audit

The unchanged original run finishes after50 steps with exit_reason abs_step_limit in1086.22 seconds. Complete trajectory and conversation JSONL, raw logs and serialized best pass are preserved under sources/original-agent-smoke-terminal-v1. There are30 file_editor calls, seven pass_evaluator calls and13 missing-function-call responses. All seven evaluator calls explicitly report no pass matched and return0.10000000000000002. No accepted implementation or measured kernel speedup is established. The serialized best snapshot contains an empty Triton convolution kernel, so it is not a valid implementation even if matching were repaired.

The original runtime's _calculate_reward unconditionally returns1.0 with test_output Reward calculation not yet implemented. This top-level reward must not be aggregated as benchmark performance. Script394 independently extracts the evaluator's Score data JSON and verifies it against the best snapshot's score.txt; no original agent/evaluator code is altered. Its verified-facts.json is the authoritative terminal summary.

A diagnostic using the original source model and saved pattern on small CPU shapes under Torch2.11 finds one ordinary symbolic-FX/Dynamo match, but zero after PassNet's original force_args_symbolic_trace changes functional ReLU from kwargs inplace=True to positional True. This explains why the ordinary DiagnosticMatcher can report no specific failure while _replace_pattern finds no match. The diagnostic uses pinned original tracer source and records both graphs. It is not yet an exact Torch2.12 DGX/GPU confirmation and does not turn the incomplete candidate into a correct kernel. Confirm the actual runtime and paper-version behavior before broadening the original-agent comparison or assigning all failure to model quality. Any evaluator repair would be a separately declared modified protocol.

The owned model server is now stopped after terminal collection; sources/original-agent-smoke-terminal-v1/model-server-release-v1.json records its exact container identity and shutdown. No compiler GPU measurement overlaps subsequent serving. The earlier published reference20 remains a historical first-feedback report, explicitly written while the trajectory was active.
''')
with (p/'reference/01-detailed-investigation-diary.md').open('a') as f:f.write('''
## Step 144: Import singleton views through shared reshape semantics

While the original agent ran unchanged, local CPU work added static unsqueeze/squeeze binding over existing Kiln reshape. All57 FX tests pass, and full-corpus import eligibility rises to1251 graphs/76 complete families without regressions. Seven newly complete families retain all55 variants in a frozen execution plan; acceptance remains27/338 pending CUDA and original evaluator checks.

### Prompt Context
See earlier requests to implement missing Kiln pieces, preserve provenance/scripts, reassess architectural sprawl and retain the entire200-task goal. This continuation follows the active goal; runtime metadata is not a new authored user request.
**Assistant interpretation:** Make independent compiler progress without modifying the active reference experiment or overlapping GPU work.
**Inferred user intent:** Advance complete support using reusable compiler semantics and explicit evidence gates.

### What I did
- Extended fx_indexing.py with one singleton-view binder for public, method and ATen source forms, reusing lower_reshape and its metadata contract.
- Consolidated repeated source operand lookup for matrix, normalization and new layout binding in fx_import.py.
- Added semantic/malformed-input/ownership/FX-Dynamo tests and archived primary source contracts plus121 independent source probes.
- Scripts389–392 preserve source acquisition, validation, the complete2060-graph audit and every newly complete task in original membership.

### Why
- The existing reshape operation already expresses static singleton insertion/removal. A separate compiler operation or duplicate layout module would add unnecessary infrastructure.
- Source views alias storage; granting new ownership through them could make later in-place functionalization incorrect.

### What worked
- All57 FX tests pass under Torch2.11.0+cu130. Equivalent source spellings produce identical scripts, with no extra argument-normalization rule.
- Import audit:1196→1251 eligible graphs,69→76 complete families,55 newly imported graphs and zero regressions.
- All seven newly complete families/55 variants are frozen without dtype or shape filtering. Native/execution acceptance is still open.

### What didn't work
- First targeted test run exhausted Dynamo's per-code cache: torch._dynamo hit config.recompile_limit (8); the ninth independent capture produced no graph (AssertionError: 0 != 1). Resetting Dynamo between independent capture cases fixes the test isolation, without changing matcher predicates.
- Direct urllib download of the official PyTorch unsqueeze page returned HTTP403. The tagged v2.9.1 upstream docstring source and exact installed docstrings are archived instead.
- The validation shell was initially authored in repository scripts while invoked through the ticket path, causing No such file or directory. It was moved to the intended ticket scripts directory before execution; the final retained script succeeds.

### What I learned
- The old audit has55 method unsqueeze blockers, six public-function blockers and two squeeze blockers. Resolving a first blocker does not guarantee all such graphs become importable; exactly55 new graphs now qualify.
- Empty squeeze axes are a no-op, selected non-unit axes remain unchanged, and scalar axis0/-1 is accepted. Explicit None differs from an omitted argument.

### What was tricky to build
- Negative axes use rank+1 for insertion and max(1,rank) for removal. Duplicate axes must be detected after normalization.
- Views remain excluded from fresh ownership even when their input was freshly allocated; this preserves the conservative alias contract.

### What warrants a second pair of eyes
- Review scalar/empty-axis cases, ATen overload validation, output metadata checks and ownership tests before CUDA qualification.

### What should be done in the future
- Validate independent CUDA fixtures and the complete frozen seven-family cohort from committed source, with serving unloaded. Count only original nominal correctness as acceptance.

### Code review instructions
- Start with lower_singleton_view, shared operand_spec, test_fx_singleton_views.py, singleton-view-import-delta.json and its frozen task plan.

### Technical details
- Official PyTorch2.9 API references: https://docs.pytorch.org/docs/2.9/generated/torch.unsqueeze.html and https://docs.pytorch.org/docs/2.9/generated/torch.squeeze.html.
- No source algorithm was copied; dimension binding independently reuses existing Kiln reshape and its singleton coordinate canonicalization.

## Step 145: Audit the terminal original-agent run and release serving resources

The original50-step trajectory is terminal and fully collected. Seven evaluator calls all reject matching with score0.1; the top-level reward1.0 is an explicit placeholder in original source. A structural diagnostic also finds an argument-form asymmetry in the original tracer, so the rejection must not be attributed solely to model quality. The owned server is stopped before subsequent GPU compiler validation.

### Prompt Context
See Steps140–143 and the original reproduction/self-optimization objective. The prior goal turn made progress through operational source/provider qualification and publication; this turn verifies the specific live run, then preserves its terminal evidence.
**Assistant interpretation:** Establish actual benchmark outcomes rather than interpreting process completion or placeholder reward as success.
**Inferred user intent:** Obtain scientifically meaningful original-agent evidence before comparing it with Kiln-native optimization.

### What I did
- Script393 requires terminal receipt and missing original tmux session before copying complete trajectory, completions, logs and source identities.
- Script394 extracts seven evaluator Score data JSON records, cross-checks the serialized best score, and saves best pass files without executing their kernel.
- Script396 compares ordinary FX tracing, original argument-forcing tracing and normalized graph structure on small CPU shapes.
- Script395 checks exact owned server identity and terminal agent state before stopping the model server; the shutdown receipt is preserved.

### Why
- Original _calculate_reward returns1.0 unconditionally; aggregating that field would invent a successful reference result.
- The original diagnostic path and actual replacement path use different pattern tracers. A no-specific-failure diagnostic does not prove that the actual matching representation is equivalent.

### What worked
- Terminal run:50 steps,1086.2246 seconds, exit_reason abs_step_limit,30 editor calls, seven evaluator calls,13 missing-function-call responses.
- All evaluator calls explicitly reject matching and score0.10000000000000002. Serialized best score agrees. No accepted implementation is claimed.
- The best serialized pass is preserved; its convolution Triton function is empty. This is independently insufficient for kernel correctness.
- Local CPU probe: ordinary FX/Dynamo match count1, original argument-forced pattern count0. ReLU kwargs inplace=True becomes positional True only in the forced pattern. Max prompt count34415 stays below configured40960 context; no observed context overflow is claimed.
- Owned serving container025b74f4 is stopped after collection, with image/model identity checks and zero stop-command error.

### What didn't work
- The original trajectory's reward1.0 is unsupported as a performance result: test_output is Reward calculation not yet implemented and original source documents the unconditional stub.
- Every observed candidate fails matching. Source-tracer asymmetry is demonstrated locally, but exact DGX Torch2.12/GPU and paper-version confirmation remain open; no broad matcher fix is silently applied.
- Thirteen responses contain no function call. Their agent feedback is preserved, without inventing a cause from context limits or treating them as successful steps.

### What I learned
- Process success, trajectory presence, actual tool score and accepted kernel correctness are four distinct gates.
- A failure-aware reference experiment can reveal a framework/runtime issue that must be separated from the generated candidate's own incomplete computation.

### What was tricky to build
- The original best snapshot is serialized inside output_patch rather than exposed as ordinary files after container teardown. Extraction preserves the content and records hashes; candidate code is parsed but its empty kernel is not executed.

### What warrants a second pair of eyes
- Verify original custom_replacement.py force_args_symbolic_trace versus DiagnosticMatcher, then reproduce on exact DGX runtime before claiming the cause of all seven failures.

### What should be done in the future
- Confirm original matching under the actual and paper-version runtime, retain the unchanged reference result, and declare any repaired evaluator protocol separately.
- Continue original200-task accounting, remaining compiler support, reusable synthesis and pending requested delivery. The full goal remains active.

### Code review instructions
- Start with original-agent-smoke-terminal-v1/verified-facts.json, complete JSONL files, best-snapshot, cpu-pattern-structure-v2.json and release receipt.
- Inspect original runtime _calculate_reward and original custom_replacement.py beside scripts393–396. No upstream source is modified.

### Technical details
- Model artifact remains available under remote sources; the server process is stopped rather than deleting weights or changing the original experimental inputs.
- The first-feedback vault article remains historically accurate. A later milestone report should include the terminal audit and exact-runtime diagnosis.
''')
with (p/'reference/03-project-roadmap.md').open('a') as f:f.write('''

### Terminal original-agent audit and singleton import expansion

The shipping50-step original-agent run is terminal: seven evaluator calls all reject matching with the0.1 penalty; original top-level reward1.0 is a placeholder and is excluded. Design18/diary145 and original-agent-smoke-terminal-v1/verified-facts.json own the result. An original argument-tracing asymmetry is reproduced locally; exact DGX/paper-version diagnosis is pending. Serving is now stopped.

Static singleton views reuse existing reshape, with57 FX tests passing. Import eligibility reaches1251 graphs/76 complete families, with no regressions. Every newly complete family is frozen in singleton-view-source-cohort-plan.json (seven tasks/55 variants). CUDA/original evaluation qualification is pending; accepted coverage remains27 complete tasks/338 individual graphs. Design15 and diary144 own semantics/provenance.
''')
