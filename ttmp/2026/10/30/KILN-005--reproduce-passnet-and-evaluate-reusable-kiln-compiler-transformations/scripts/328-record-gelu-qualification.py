#!/usr/bin/env python3
"""Append native/cohort evidence and matching diagnosis at a commit boundary."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
entry='''
## Step 137: Qualify native GELU and retain every original-cohort failure

All36 native CUDA fixture records pass, checking108 outputs for exact/tanh modes and low-precision source boundaries. The original five-family/60-variant run is terminal and independently audited: two families/18 graphs qualify at nominal t=-5, seven fail structural matching, and35 remain unexecuted after two compile-check failures. Cumulative verified replay reaches26/200 complete tasks and331/2060 graphs, with266 inside complete tasks.

The matching failure has a concrete integration cause. Functional LayerNorm uses keyword affine/epsilon fields in symbolic FX but positional fields in Dynamo. Extending the existing signature normalizer changes actual-source matching from zero to one. All53 FX tests pass after correcting two diagnostic-test assumptions. The complete seven-variant repair replay is separately frozen; no additional acceptance is inferred yet.

### Prompt Context
See Step136 for the user's supplied IP/SSH alias and the earlier authored implementation, provenance and detailed-diary requests.
**Assistant interpretation:** Complete real CUDA/original-evaluator qualification, fix diagnosed integration failures and keep numerical discrepancies visible.
**Inferred user intent:** Advance actual supported coverage with reproducible evidence rather than equating successful import with execution.
**Commit (implementation):** d316241 — lower exact GELU with explicit source precision and approximation modes.

### What I did
- Staged and verified the164-file committed runtime/compiler snapshot before GPU execution.
- Preserved two terminal pre-workload wrapper failures, then used the already-established sg docker launch convention and installed /usr/local/bin Node26.8.1.
- Collected all terminal run/artifact/log bytes and checked native/run hashes against the saved authoritative observation.
- Shared summarize_task_run audits all60 graph identities. Script325 verifies source revision, all25 compiled artifacts, two failed compile attempts, score/log hashes and all36 fixture records.
- Script324 diagnoses sparse end-to-end check discrepancies without changing tolerances. Script326 captures actual source FX/Dynamo and proves the LayerNorm mismatch/repair.
- Extended the existing functional signature whitelist; tests retain affine roles, epsilon and output values under FP32/FP16/BF16.
- Added primary NVIDIA/llama.cpp/Qwen serving references to sources for forthcoming original PassAgent provisioning; no model server or weight download has started.

### Why
- Process exit0 and scoring do not imply matching/numerical acceptance. The strict audit accepts only18 of the25 evaluated graphs.
- Reusing the existing argument normalizer fixes the public source contract without introducing another matching implementation.
- Native fixture success does not waive checks on larger reduction/convolution compositions.

### What worked
- CUDA fixture36/36, all108 outputs compared at existing dtype tolerances.
- Complete two accepted tasks contain8+10 graphs; cumulative26 tasks/331 graphs verified by the existing coverage builder.
- Real source LayerNorm matching moves0->1 after normalization. All53 FX tests pass; changing epsilon still prevents a match.
- Remote access through manuel@bling with HostKeyAlias=bling.local works without accepting unknown host keys.

### What didn't work
- First wrapper: /home/manuel/.nvm/nvm.sh: No such file or directory. It exits before any GPU record or cohort directory exists. The local nvm assumption was wrong; the installed remote Node is /usr/local/bin/node.
- Second wrapper: permission denied while trying to connect to the docker API at unix:///var/run/docker.sock. The SSH login has docker group membership but the existing tmux path does not; the established sg docker child invocation succeeds. Both failed logs and wrappers remain archived.
- Task151 originally logs [PassMgrBackend] No passes modified the graph for all seven variants; no replacement or numerical acceptance is claimed for them in v1.
- Task168 reports2/401408 failing compiler-reference values; task186 reports5/2047488. Maximum observed absolute discrepancy is0.001953125. Their origin remains under investigation; FP32 accumulation order and narrowing boundaries are hypotheses, not established harmlessness. Both compile failures stay visible.
- The initial new regression test passed source-order arguments directly to Dynamo's reordered backend graph, producing a bias-shape RuntimeError. Capturing actual runtime invocation order fixes the test. Its changing closure epsilon then became a Dynamo tensor input, causing0 matches; static literal epsilon matches the dataset's actual contract and passes. Versions1–3 failure logs are retained, with successful v4 separate.

### What I learned
- A builtin activation's support can expose a surrounding signature mismatch and sparse predecessor/reference sensitivity. Each gate needs its own retained evidence.

### What was tricky to build
- Ownership/source argument order, canonical keyword defaults and actual Dynamo backend input order are different contracts. The regression test now observes invocation order and preserves all semantic predicates.

### What warrants a second pair of eyes
- Review the two compile failures before treating them as numerical tolerance issues. No threshold, check or numerical policy was changed to make them pass.
- Review exact seven-variant membership in the targeted replay; it repairs a known integration failure and is not fresh optimization confirmation.

### What should be done in the future
- Commit the repair, stage its exact source snapshot and run all seven variants through original replay before updating coverage again.
- Diagnose the35 compile-blocked variants without weakening correctness criteria. Provision a local model runtime after isolated GPU timing work; original PassAgent remains open.
- Publish the GELU technical milestone after the targeted repair outcome is independently audited.

### Code review instructions
- Begin with design17, gelu-source-cohort-v1-verified-facts.json, both source matching diagnostics and compile-check diagnosticv1.
- Run script325 with a new --output basename for reproducible independent source/artifact checks. Use the shared summary tool for exact native nominal acceptance.

### Technical details
- d316241 is the frozen compiler/runtime source revision for the original GELU cohort. Node26.8.1 and NVIDIA GB10 execute the declared source plan.
- Kernel/compiler code remains unchanged by the LayerNorm signature repair; only the integration whitelist and its regression test change.
- Overall goal stays active; no original-agent result, native precision completion or full200 support is claimed.
'''
f=p/'reference/01-detailed-investigation-diary.md';assert '## Step 137:' not in f.read_text()
with f.open('a') as file:file.write(entry)
f=p/'design-doc/17-exact-gelu-source-semantics-and-scalar-operation-math-lowering.md';s=f.read_text().replace('They are evidence of reference/FP32-rounding sensitivity, not proof of a harmless mismatch.','Their origin remains under investigation; FP32 reduction order and narrowing boundaries are hypotheses, not established harmlessness.');f.write_text(s)
print('Recorded complete native/original evidence and pending matching repair')
