---
Title: Implementation diary volume 2 - Pi agents and compiler optimization
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T13:24:18.009948851-04:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary — volume 2

Continues [volume 1](01-detailed-investigation-diary.md), Steps 1–159. Numbering continues across volumes. Earlier experimental evidence remains authoritative for its stated revision.

## Step 160: Begin the owned policy transport and rotate the diary

Added a serial NDJSON process interface around the existing NativePolicyTask. This is an implementation checkpoint toward the requested Pi integration; it does not yet execute Pi tools or produce a new policy experiment. The previous continuation verified an existing commit without changing implementation state; this step resumes concrete implementation.

Started this second diary volume at the user's suggestion. Volume 1 remains intact, including the provider connectivity result and the abandoned prototype's provenance.

### Prompt Context
**User prompt (verbatim):** "you can create a new diary at this point, if it's that big, btw"
**Assistant interpretation:** Continue detailed chronological documentation in a manageable new volume.
**Inferred user intent:** Preserve navigable history without repeatedly growing a very large document.
See Step 159 for the Pi/LunaRoute request and diary requirements.
**Previous commit:** 5c5b0a5 — Record Pi LunaRoute transition and verified provider connectivity.

### What I did
- Added integrations/passnet/native_policy_rpc.py with explicit manifest, receipt, output, proposal budget and Node arguments.
- Forwarded tool arguments unchanged to the existing task, including malformed submission arguments.
- Required unique request IDs; rejected duplicate transport requests before task execution.
- Closed the task on EOF or transport failure using finally.
- Created this document with docmgr doc add and linked the two volumes.

### Why
- One owned Python process preserves the task's existing ledger and serial accounting across Pi native tool calls.
- Transport retries must not silently duplicate submissions or restore proposal budget.

### What worked
- python -m py_compile integrations/passnet/native_policy_rpc.py passed.
- An in-memory transport check verified null submission arguments reach task.call unchanged, EOF closes the task, and duplicate IDs fail before a second dispatch.
- Docmgr completed successfully after polling the original process handle.

### What didn't work
- No implementation failure was observed. The checks used a fake task and do not prove real validator execution or Pi event ordering.
- A broad process-list diagnostic included sandbox launcher boilerplate and was unhelpful; the existing execution handle remained the authoritative process observation.

### What I learned
- The existing task dispatch already owns invalid-submission accounting; the transport should preserve it rather than duplicate validation.

### What was tricky to build
- Distinguishing malformed transport envelopes from malformed tool arguments: envelope errors terminate transport, while valid envelopes containing invalid tool arguments reach the ledger.

### What warrants a second pair of eyes
- Review closure behavior when a task raises after reserving an attempt. A finished ledger records termination, not scientific success.
- Pi must charge identifiable submissions before framework argument validation; this transport alone does not establish that guarantee.

### What should be done in the future
- Implement the Pi SDK owner, request limits, message-end accounting and retained traces.
- Exercise the real task through this transport and run a bounded provider experiment with explicit protocol identity.

### Code review instructions
- Start with native_policy_rpc.serve and NativePolicyTask.call.
- Check duplicate request rejection, unchanged argument forwarding and EOF/failure closure.

### Technical details
- Wire format: kiln-native-policy-rpc/1 ready record, then requests with id/tool/arguments and responses with id/result.
- No implicit retry, resumption, provider access, evaluator invocation or production compiler change is introduced.

## Step 161: Implement pre-execution accounting for native Pi submissions

Added a framework-facing policy tool boundary that accounts for submissions in an awaited assistant-message hook before tool execution. This addresses the argument-validation ordering discovered in Step 159. The implementation is independently tested but is not yet installed into a running Pi session.

### Prompt Context
See Step 159 for the authored Pi/LunaRoute request and Step 160 for diary rotation.
**Assistant interpretation:** Preserve the trusted proposal budget when moving from the old XML protocol to native tool calls.
**Inferred user intent:** Obtain reliable, faster agent experiments without losing experimental accountability.
**Previous commit:** a96df7a — Begin owned policy RPC transport and second implementation diary.

### What I did
- Added PiPolicyTools in integrations/passnet/pi_policy_tools.mjs.
- Stored results by tool call ID before execution and returned those results without a second submission.
- Charged truncated assistant submissions with null arguments, preventing their policy bodies from being admitted.
- Added focused tests for multiple calls, invalid arguments, exhausted budget termination, truncated replies, unaccounted execution and duplicate IDs.

### Why
- Pi validates arguments before its tool execution hook; charging only inside execution would miss invalid submissions.
- Native multi-call responses are permitted in this new protocol, with each submission charged individually.

### What worked
- Node 26 ran pi_policy_tools.test.mjs successfully (one passing test-file receipt, containing two cases).
- The fake RPC observed two charges before execution and no additional charge when returning a stored result.

### What didn't work
- No test failure occurred. These tests do not prove SDK hook installation, provider limits, or real task execution.

### What I learned
- Separating the accounting boundary from SDK setup allows direct tests of the important ordering contract without making a provider call.

### What was tricky to build
- Truncated messages may still contain recognizable calls. Their attempts must be charged without accepting partially generated policy bodies.

### What warrants a second pair of eyes
- The eventual owner must await observe, serialize messages and stop provider requests after exhaustion. terminate on tool results alone is insufficient when framework validation rejects a call.

### What should be done in the future
- Install this boundary in the Pi SDK owner with the RPC transport, hard request/token limits and retained event traces.
- Verify actual SDK event ordering with a controlled provider, then run the requested LunaRoute experiment.

### Code review instructions
- Read PiPolicyTools.observe before execute, then run node --test integrations/passnet/pi_policy_tools.test.mjs using Node 26.

### Technical details
- Complete submission bodies are admitted only for stopReason stop or toolUse; other stop reasons submit null to the trusted task.
- This checkpoint changes no compiler artifacts, coverage counts, benchmark results or previous comparison evidence.

## Step 162: Correct the hook-failure assumption before connecting the provider

Inspection of the installed Pi extension runner revealed that both message_end and before_provider_request handlers catch exceptions and report them without propagating them to the agent. This changes the integration design: throwing from an extension is not a hard request-budget boundary. Added persistent accounting-failure state so subsequent tool execution cannot return a previously accepted result after an accounting failure.

### Prompt Context
See Step 159 for the user's Pi integration request.
**Assistant interpretation:** Verify actual SDK behavior before relying on it for experimental controls.
**Inferred user intent:** Reliable bounded model experiments with an auditable execution path.
**Previous commit:** ed1a613 — Account native Pi policy submissions before tool validation.

### What I did
- Read installed dist/core/extensions/runner.js, specifically emitMessageEnd and emitBeforeProviderRequest.
- Added persistent failure state to PiPolicyTools and blocked subsequent execution after observation failure.
- Extended the duplicate-ID case to verify that a swallowed observation exception cannot permit later tool execution.

### Why
- Awaited hooks establish ordering but do not imply exception propagation.
- The owner needs a provider request boundary independent of extension exception handling.

### What worked
- Node 26 focused tests passed, including rejection of execution after duplicate-ID observation failure.
- Source inspection establishes that the current proposed exception-only request limiter would not be sufficient.

### What didn't work
- A guessed installed pi-agent-core/dist/agent.d.ts path returned No such file or directory. Discover the actual nested dependency path before further inspection.
- No live policy batch was run; request-limit enforcement remains incomplete.

### What I learned
- SDK hook failure semantics must be verified independently from event ordering.

### What was tricky to build
- Accounting may have already reserved a proposal before a later hook error. Persistent failure prevents accidental continuation while retaining the ledger's consumed slots.

### What warrants a second pair of eyes
- Verify a hard stop outside the exception-swallowing extension runner, including underlying provider retries.

### What should be done in the future
- Discover and inspect the actual agent stream interface; implement owner-level request limits and cancellation before invoking LunaRoute for policies.

### Code review instructions
- Inspect PiPolicyTools.observe and execute, then rerun the focused Node test file.
- Inspect the installed Pi runner catch blocks rather than assuming extension exceptions stop inference.

### Technical details
- A failure sets closed and retains the error for all later observation/execution attempts.
- This is tool-side protection only. It does not yet stop provider network requests or qualify an end-to-end Pi experiment.

## Step 163: Add an inference admission gate outside extension hooks

Located the actual nested pi-agent-core dependency and confirmed that Agent exposes streamFunction. Added a request gate intended for that boundary. It reserves completion allowance before dispatch, enforces model identity and request count, and passes maxRetries zero to the provider. This is a tested component, not yet a verified live SDK integration.

### Prompt Context
See Step 159 for the authored Pi/LunaRoute request.
**Assistant interpretation:** Establish enforceable inference limits independently of swallowed extension exceptions.
**Inferred user intent:** Bounded, reproducible agent experiments.
**Previous commit:** d8f2048 — Stop policy tool execution after swallowed accounting failures.

### What I did
- Discovered nested pi-agent-core/dist/agent.js and agent.d.ts using rg --files.
- Inspected pi-ai/dist/api/openai-completions.js: the OpenAI client uses maxRetries zero, while the outer retryProviderRequest receives options.maxRetries.
- Implemented createRequestGate with explicit provider/model identity, request count and conservative completion reservation.
- Tested model mismatch, token cap override, retry override, exhaustion, closed state and failed dispatch without refund.

### Why
- The stream entry point is outside extension-hook exception suppression.
- Reserving the full allowed output before dispatch avoids relying on missing usage receipts after provider failures. This differs from charging only observed completion tokens and must be declared in the next protocol.

### What worked
- Both focused Node test files passed, containing four cases in total.
- The fake provider received allowances of ten and five tokens under a fifteen-token budget; a third dispatch was rejected.

### What didn't work
- No new failure occurred. Actual LunaRoute payload enforcement and SDK installation remain unverified.

### What I learned
- There are two retry layers in the installed OpenAI-compatible implementation. The explicit stream option controls the outer retry helper.

### What was tricky to build
- Requests that fail after admission must retain their reservations; otherwise repeated failures could evade the declared allowance.

### What warrants a second pair of eyes
- Verify that the selected LunaRoute route uses the inspected provider implementation and that extensions cannot raise the final payload token cap.
- Keep actual usage separate from reserved allowance in reports.

### What should be done in the future
- Install the gate on the session agent, connect the RPC owner and native tools, inspect actual payloads, and run the bounded policy experiment.

### Code review instructions
- Read pi_request_gate.mjs and run Node 26 --test on pi_request_gate.test.mjs and pi_policy_tools.test.mjs.

### Technical details
- The gate forwards existing options but overrides maxTokens and maxRetries.
- Failure recording is conservative: reservations occur before recording or provider dispatch, with no automatic refund.
- No new optimization, benchmark coverage or end-to-end agent result is claimed.


## Step 164: Assemble and initialize the actual Pi policy session

Connected the policy accounting boundary and inference gate to an actual Pi SDK session. The setup check selected lunaroute/glm-5.3-flash through openai-completions and verified exactly three active tools. No inference prompt was sent. The remaining work is the owned RPC client, bounded run lifecycle and real policy batch.

### Prompt Context
See Step 159 for the authored Pi request.
**Assistant interpretation:** Move from isolated components to the installed SDK.
**Inferred user intent:** A functioning fast agent pipeline with preserved experiment controls.
**Previous commit:** a9fbd49 — Bound Pi inference admission outside extension hooks.

### What I did
- Added pi_policy_session.mjs using the installed SDK, explicit LunaRoute extension, native tools and retained-event callbacks.
- Disabled automatic compaction and retry settings and excluded unrelated tools, skills, prompt templates and context files.
- Installed the inference gate on session.agent.streamFunction.
- Saved script 445 and the successful setup receipt under sources/pi-policy-session-setup-v1.

### Why
- Actual session construction verifies API assumptions that isolated component tests cannot establish.
- Explicit tool selection prevents the policy agent from using unrelated coding or provider web tools.

### What worked
- Node syntax validation passed.
- Script 445 completed successfully with the installed SDK and provider; active tools were finish, inspect_training and submit_policy.
- The selected API is openai-completions, matching the inspected retry implementation.

### What didn't work
- The first sandboxed setup failed: Credential store read failed for lunaroute: EROFS: read-only file system, mkdir '/home/manuel/.pi/agent/auth.json.lock'. Retrying with authorized escalation allowed Pi's normal credential-store lock. No credential values were read or printed by our code.
- Setup success does not verify actual message hooks, request payload token limits or end-to-end policy submission.

### What I learned
- SDK session initialization requires credential-store locking even without an inference request.

### What was tricky to build
- Provider registration and exact tool selection must complete before choosing the model and installing the gate. Setup asserts the resulting allowlist.

### What warrants a second pair of eyes
- Confirm isolation after session startup hooks and verify final provider payload limits during the actual run.
- The caller must provide RPC serialization, durable trace storage and wall-clock cancellation.

### What should be done in the future
- Connect the owned RPC process, retain actual policy traces and run the bounded development batch.

### Code review instructions
- Inspect createPolicySession and script 445; the source receipt explicitly labels setup-only success.

### Technical details
- Settings are in memory; authentication is resolved internally by Pi.
- The module imports the installed SDK and TypeBox through explicit package resolution, without installing another framework or copying upstream implementation code.

## Step 165: Connect the owned process and prepare the first Pi development batch

Implemented the run owner with a serialized Python RPC process, persistent event records, session disposal and a wall-clock deadline. Prepared a four-proposal GLM development batch using the earlier training corpus. The attempted tmux launch was rejected by automatic approval review before execution; no inference batch started.

### Prompt Context
See Step 159 for the authored authorization to use Pi/LunaRoute.
**Assistant interpretation:** Execute the requested framework/provider experiment with a distinct protocol and retained evidence.
**Inferred user intent:** Reach measured policy generation and compiler evaluation.
**Previous commit:** 70973bf — Assemble and verify installed Pi policy session setup.

### What I did
- Added run_pi_policy_agent.mjs to own the Python process, serialized requests, event files, timeout and terminal receipt.
- Added script 446 to preserve a native-tool prompt derived from the existing policy grammar, removing XML-specific behavior.
- Prepared pi-policy-batch-v1/config.json with four proposals, twelve maximum requests, 4096 tokens per request, 24576 reserved completion tokens and a five-minute deadline.
- Attempted a tmux launch named kiln-pi-policy-batch-v1.

### Why
- This experiment is distinct from the published Qwen/XML result and uses already-consumed development data.
- Serial RPC preserves the existing trusted task's ownership and proposal accounting.

### What worked
- Node syntax validation passed for the owner; script 446 generated the retained configuration.
- Configuration explicitly avoids any claim of fresh held-out generalization.

### What didn't work
- Automatic approval review rejected the launch: "This starts a real networked LunaRoute inference batch that will transmit private training-manifest/features and prompts derived from the repository; while the user authorized using Pi/LunaRoute, they did not specifically authorize exporting this sensitive payload to that external provider."
- The rejected action was not retried or bypassed. The runner remains unverified end to end.

### What I learned
- Current automatic review requires payload-specific authorization beyond the existing provider preference.

### What was tricky to build
- The Python process owns the ledger; the JavaScript owner must serialize request/response IDs and preserve failure receipts without retrying submissions.

### What warrants a second pair of eyes
- Validate actual SDK event ordering, timeout behavior and final provider token caps before treating a completed run as a qualified experiment.

### What should be done in the future
- Obtain explicit approval for sending the training-only features and repository-derived policy prompt to LunaRoute, or continue local-only validation.
- Run the batch once authorized and compile/evaluate accepted policies with the existing harness.

### Code review instructions
- Inspect run_pi_policy_agent.mjs, script 446 and the retained configuration before approving the external inference payload.

### Technical details
- No real batch was launched in this step. The separate earlier READY connectivity call and setup check remain the only successful provider/session evidence.
- No benchmark score, task coverage or optimization result changed.

## Step 166: Verify the real policy process and validator locally

Ran the actual Python RPC process against the existing training manifest and receipt, using the real Node policy validator. Invalid and duplicate submissions consumed slots, the valid policy produced one artifact, and the excess submission was rejected without creating another attempt. This advances local integration validation while the external payload approval remains pending.

### Prompt Context
See Step 159 for the Pi request and Step 165 for the external launch rejection.
**Assistant interpretation:** Continue unaffected implementation validation without bypassing the rejected provider action.
**Inferred user intent:** Make useful progress toward a reliable agent experiment.
**Previous commit:** c31f3ed — Prepare owned Pi policy batch and record rejected external launch.

### What I did
- Added script 447 to drive native_policy_rpc.py with five explicit requests and a three-slot budget.
- Retained the request stream, responses, stderr, task ledger, validated artifact and verification receipt under sources/pi-real-rpc-verification-v1.
- Checked response IDs, terminal status, attempt count and artifact count against the actual filesystem ledger.

### Why
- Earlier transport tests used a fake task. This check exercises subprocess transport, real manifest validation, Node policy validation and persistent accounting together.

### What worked
- Script 447 passed with response statuses rejected, accepted, duplicate, budget_exhausted and finished.
- Exactly three attempt request files and one artifact file were written. finished.json reports three attempts and one unique artifact.
- Zero provider requests were made; no GPU evaluation occurred.

### What didn't work
- No local validation failure occurred. The external batch remains unstarted because its payload-specific approval has not arrived.

### What I learned
- The owned-process boundary preserves the existing task's invalid and duplicate accounting with real compiler artifact validation.

### What was tricky to build
- Excess submissions must receive a response without creating an extra ledger attempt; the filesystem assertions verify this distinction.

### What warrants a second pair of eyes
- This is a deterministic host-authored test policy, not an LLM-generated optimization. It proves neither Pi event ordering nor performance improvement.

### What should be done in the future
- Validate Pi with controlled local responses and verify timeout handling; execute the actual provider batch only after the required authorization.

### Code review instructions
- Inspect script 447 and sources/pi-real-rpc-verification-v1/verification.json, then compare stdout.jsonl with task attempt records.

### Technical details
- Test policy: kiln-fusion-policy/1 threshold 0.95. The fixture ID is rpc-test.
- Earlier publication, coverage figures and benchmark outcomes remain unchanged.


## Step 167: Verify accounting inside the actual Pi agent loop locally

Ran the installed Pi SDK with a synthetic local provider and a scripted native tool response containing invalid arguments. The actual message hook charged that submission before framework validation, and the closed boundary prevented another inference dispatch. No LunaRoute request or credential access was involved.

### Prompt Context
See Step 159 for the Pi request and Step 165 for the pending external payload approval.
**Assistant interpretation:** Test SDK event ordering locally while preserving the external launch restriction.
**Inferred user intent:** A dependable agent integration, verified through actual execution.
**Previous commit:** 1a13b13 — Verify real policy RPC accounting with compiler artifact validation.

### What I did
- Added script 448 with an isolated agent directory, fixture provider and scripted stream function.
- Initialized the production session factory and replaced inference with a deterministic native call containing the wrong argument key.
- Asserted one accounting call, one inference dispatch and closed budget state after the actual Pi loop returned.
- Retained the fixture source and complete event/result receipt under sources/pi-local-ordering-v1.

### Why
- Component tests cannot prove installed SDK hook ordering or what happens after native argument validation fails.

### What worked
- The Node 26 script completed successfully.
- The accounting hook received submit_policy with {wrong:1}; only one scripted inference dispatch occurred.
- The model loop terminated despite the malformed native call, with the closed gate preventing additional dispatch.

### What didn't work
- No failure occurred. This uses a fake task callback and scripted inference; the real RPC was independently checked in Step 166. Their full composition still needs validation.

### What I learned
- The installed SDK's awaited message hook can implement pre-validation charging, and the stream gate supplies the required independent stop boundary.

### What was tricky to build
- The malformed tool never needs to execute successfully for its proposal attempt to be accounted. A provider boundary is still needed to stop the next model turn after validation failure.

### What warrants a second pair of eyes
- Inspect the retained event sequence and distinguish a scripted provider response from an LLM result.

### What should be done in the future
- Exercise the complete owner lifecycle, including real RPC and timeout/error cases. Keep external inference pending explicit payload approval.

### Code review instructions
- Start with script 448 and sources/pi-local-ordering-v1/result.json. The fixture uses a deliberately unusable loopback URL; the network stream is replaced before prompting.

### Technical details
- Provider local-fixture/model scripted, one native submit_policy call with ID invalid-1.
- No compiler speedup, benchmark coverage change or model-quality result follows from this test.

## Step 168: Complete the local Pi round trip and adopt six-lane planning

The complete production owner passed with a local scripted provider: Pi generated a native submission, the real Python ledger and Node validator accepted one artifact, and the process exited cleanly. The user then clarified that LunaRoute token costs are irrelevant and requested six concurrent lanes. Updated the design direction accordingly without conflating that clarification with the pending external payload approval.

### Prompt Context
**User prompts (verbatim):**
- "there's no budget need on lunaroue btw, tokens are free."
- "we can just do 6 concurrent lanes, so that way it's easier for you to test out things."
**Assistant interpretation:** Avoid cost-driven token constraints and support six independent concurrent proposal experiments.
**Inferred user intent:** Increase iteration throughput while retaining traceable experiments.
**Previous commit:** e4875a0 — Verify native Pi accounting order with local scripted inference.

### What I did
- Added script 449 to exercise the production runner with a scripted local provider and the real policy task.
- Retained complete owner events, session records, ledger, artifact and terminal verification.
- Updated design 20 with the verified integration boundary and six-lane architecture.

### Why
- Full composition can fail even when isolated SDK and RPC tests pass.
- Concurrent proposal lanes can improve experimental throughput; simultaneous GPU measurements would compromise timing isolation.

### What worked
- The owner completed in 1376.677119 ms with one request, one consumed proposal slot and one unique accepted artifact.
- RPC exited with code zero and no signal. Terminal receipt states evaluation_status not_run.

### What didn't work
- No local failure occurred. External LunaRoute execution remains unstarted after the prior automatic-review rejection.
- Six-lane orchestration is a design update at this checkpoint, not implemented concurrency.

### What I learned
- The installed Pi session, accounting hook, inference gate, Python process and real validator compose successfully for the scripted valid-policy path.

### What was tricky to build
- A local provider must implement the actual SDK stream contract while ensuring no network inference occurs. The fixture implements streamSimple directly.

### What warrants a second pair of eyes
- This 1.38-second elapsed time is a local fixture measurement, not GLM throughput or GPU speedup.
- Concurrency requires independent ledger ownership and serialized GPU evaluation.

### What should be done in the future
- Add six-lane orchestration using the existing owner and revise cost-motivated caps. Preserve declared experimental allowances where needed for comparisons.
- Resolve external payload approval, then run actual model proposals and evaluate accepted artifacts.

### Code review instructions
- Inspect script 449, sources/pi-local-full-run-v1/verification.json and the owner event stream.
- Read design 20's new checkpoint before implementing lane orchestration.

### Technical details
- The fixture policy is a threshold policy with max_work_growth 0.95, not an LLM discovery.
- The local run reserved 4096 completion tokens but reported synthetic usage; neither number estimates real inference cost.

## Step 169: Run the first real GLM batch and return focus to compiler results

The user explicitly approved the external payload. Launched the prepared Pi/LunaRoute batch once, then observed its terminal receipt: four inference requests completed in 20.240613383 seconds, yielding three unique validated policies from four submissions. Compilation and GPU evaluation remain pending. This is the first real successful proposal batch through the Pi integration.

The user also corrected the work's direction: research results should take priority over production hardening. The preceding response acknowledged that concern without implementation progress. This turn resumed research, inspected fusion opportunity traces, and executed the approved model batch.

### Prompt Context
**User prompts (verbatim):**
- "how much of this whole ledger whatever infrastruxture do you think is being overly cautious, when we actually want to get some result in order to move forward?"
- "we are doing research, not production ready hardening"
- "yes. approved."
**Assistant interpretation:** Stop expanding infrastructure, pursue measured compiler candidates, and execute the previously blocked LunaRoute payload.
**Inferred user intent:** Faster discovery and useful experimental conclusions.
**Previous commit:** 4c04713 — Verify complete local Pi round trip and document six-lane direction.

### What I did
- Inspected the twelve baseline training traces: only one recorded fusion decision was rejected, at approximately 1.06 work growth. This suggests limited opportunity for increasing the threshold on this population.
- Launched the existing four-proposal configuration in tmux kiln-pi-policy-batch-v1 after explicit approval.
- Polled the same run and read its completed task and owner receipts.

### Why
- A real batch supplies actionable compiler candidates; further harness refinement was delaying the research.
- Sparse rejected decisions help explain why permissive thresholds previously collapsed to baseline artifacts.

### What worked
- GLM completed four requests and four submissions in 20.240613383 seconds.
- Attempts two, three and four produced three unique validated optimization artifacts.
- Python RPC exited cleanly. All model and tool events remain in sources/pi-policy-batch-v1/run.

### What didn't work
- Attempt one was rejected with "Unknown fusion policy field". It remains in the trace and consumed one slot.
- A sandboxed tmux observation reported Operation not permitted; authorized observation of the same session succeeded. No duplicate run was launched.
- A guessed compile_policy.py path did not exist; use the existing compile_study and policy compilation modules.

### What I learned
- Native Pi tool calling works with this actual GLM route and produces accepted policy data quickly enough for exploratory iteration.
- Policy validity does not imply changed kernels or speedup; those are the next questions.

### What was tricky to build
- No new infrastructure was built in this step. Existing components were used to obtain an actual model result.

### What warrants a second pair of eyes
- The first accepted tree contains redundant branches and mostly retains threshold 1.02. Compiler artifact comparison must precede any improvement claim.

### What should be done in the future
- Compile the three accepted policies and benchmark changed candidates. Expand to six independent exploratory lanes with hypotheses beyond threshold tuning.
- Retain essential correctness and timing controls, but stop treating production-hardening completeness as a prerequisite to research.

### Code review instructions
- Inspect pi-policy-batch-v1/run/result.json, task attempt artifacts and event records.

### Technical details
- Provider lunaroute/model glm-5.3-flash; development corpus only.
- The gate reserved 16384 completion tokens. This is not actual usage and is not an inference-cost estimate.
- evaluationStatus remains not_run. No new performance result or task coverage is claimed.

## Step 170: Compile GLM proposals and identify four new executable cases

Compiled all three accepted GLM policies across the twelve development training graphs. All 36 policy–graph compilations passed their reference checks. Attempts two and three changed five and three executables respectively; attempt four reproduced baseline throughout. Comparing fingerprints with the earlier search identifies four previously unseen executable cases, all from attempt two.

### Prompt Context
See Steps 168–169 for the user's research-first direction, six-lane preference and explicit provider approval.
**Assistant interpretation:** Move actual model proposals into compiler evaluation.
**Inferred user intent:** Obtain measurable compiler findings rather than more infrastructure.
**Previous commit:** 63f307d — Run approved GLM policy batch and retain three accepted candidates.

### What I did
- Added script 450 to extract accepted policy programs, invoke the existing compile_policy.mjs and compare training fingerprints.
- Ran the compilation in tmux kiln-glm-compile-v1 and retained artifacts, logs and summary.json.
- Compared graph/fingerprint pairs against native-policy-search-artifacts-v1 receipts.

### Why
- Valid policies can collapse to identical executables. Compilation identifies which proposals deserve measurement.

### What worked
- All three policies compiled all twelve graphs successfully.
- Attempt two changed five baseline executables and has four graph/executable pairs absent from the earlier search.
- Attempt three changed three baseline executables, but all twelve pairs occurred in the earlier search. Attempt four matched baseline on all twelve.

### What didn't work
- Attempt four yielded no executable change. This is an observed candidate outcome, not a compiler failure.
- GPU measurement has not yet been performed for the four new cases.

### What I learned
- The GLM batch produced executable novelty despite the mostly saturated default fusion decisions. Whether that novelty improves performance remains unknown.

### What was tricky to build
- Policy identity is not executable identity: comparison uses per-graph fingerprints, not policy names or artifact file hashes.

### What warrants a second pair of eyes
- Review numerical/reference assumptions inherited from the development corpus. Successful local reference checks do not establish native PassBench GPU acceptance.

### What should be done in the future
- Benchmark the new attempt-two executables on bling with the existing correctness and timing path, then decide which hypotheses merit six-lane expansion.

### Code review instructions
- Inspect script 450 and sources/pi-policy-compile-v1/summary.json, then the candidate receipts and generated kernels.

### Technical details
- Target a100 remains the scheduling proxy; the experimental hardware is GB10.
- Training-only compilation, separate contraction. No held-out performance claim or full-corpus coverage promotion.

## Step 171: Measure actual GLM policies on GB10; baseline wins

Completed the first real Pi/GLM proposal-to-GPU experiment. All candidates were eligible after correctness and timing checks, but none improved the training aggregate: attempt two scored 0.8876853334, attempt three 0.9593722814, and attempt four shared the baseline executable at 1.0. The existing selector retained baseline. This is a negative optimization result with a functioning fast proposal pipeline.

### Prompt Context
See Steps 168–169 for research-first priorities, six concurrent lanes and external payload approval.
**Assistant interpretation:** Measure actual proposals and use results to direct the next experiment.
**Inferred user intent:** Concrete optimization findings, including informative failures.
**Previous commit:** 7cfaff7 — Compile GLM policies and identify novel development executables.

### What I did
- Added script 451 to reuse the established freeze, compilation and measurement path with the actual model policies and unchanged/default controls.
- Qualified five policies across twenty graphs, then measured only the twelve development training graphs on bling.
- Used existing scripts 438 and 439 for staging and isolated GPU execution, then collected measurement.json and run.json.
- Ran the existing select_policy.py to compute the family-balanced end-to-end objective.

### Why
- Fresh baseline measurements in the same isolated run provide the relevant performance comparison.
- Reusing the established evaluator avoids constructing another benchmark.

### What worked
- All 100 policy–graph compilations passed. All twelve training graphs completed GPU evaluation.
- Every candidate remained eligible with no recorded selection failures.
- GPU owner exited successfully, its container was absent afterward, and no GPU compute process remained.
- The ranking reproducibly selects baseline: attempt two 0.8876853334471824, attempt three 0.9593722814179808, attempt four 1.0 by executable identity.

### What didn't work
- No aggregate optimization improvement was found. The new executable cases did not translate into a better reusable policy.
- A guessed script filename was absent; used the actual existing 439-run-policy-search-evaluation.py instead.

### What I learned
- Native GLM proposals are operationally useful, but the current structural-only prompt and fusion grammar produced regressions or aliases.
- The next research step should expose measured feedback and diversify transformations rather than repeat blind threshold proposals.

### What was tricky to build
- The existing evaluator qualifies the full declared corpus before training measurement. Compiling its twenty graphs does not make this a fresh confirmation study; the reused population is development data.

### What warrants a second pair of eyes
- This is the modified highest-precision FP32 compiler-policy experiment, not an official PassBench score or full200 reproduction.
- Results are one development batch; they do not establish a general ranking of model providers.

### What should be done in the future
- Run six exploratory lanes with concrete hypotheses and measured feedback, including transformations beyond the saturated fusion threshold.
- Publish the substantive agent experiment milestone with its negative outcome and research implications.

### Code review instructions
- Read pi-policy-train-results-v1/selection.json, measurement.json and run.json; inspect script 451 and the original model artifacts.

### Technical details
- GB10, twenty warmups, one hundred trials, three repeats, original stability criteria and explicit separate-contraction reference protocol.
- No fresh held-out performance claim; no production compiler change promoted.

## Step 172: Run six concurrent GLM lanes with measured feedback

All six requested proposal lanes completed successfully. They produced 34 accepted artifacts from 36 submissions in roughly 9–21 seconds per lane. Cross-lane deduplication retained 33 unique policy artifacts. Compilation is now running in tmux kiln-six-lane-compile-v1; no GPU result is yet available for this expanded batch.

### Prompt Context
See Step 168 for the verbatim six-lane request and Step 169 for research-first direction and external approval.
**Assistant interpretation:** Use concurrency and measured feedback to accelerate proposal exploration.
**Inferred user intent:** Explore multiple hypotheses quickly and evaluate concrete compiler outcomes.
**Previous commit:** be807bb — Measure GLM policies on GB10 and retain negative optimization result.

### What I did
- Added script 452 to run six independent existing owners concurrently, with separate configurations, ledgers and traces.
- Supplied actual prior policies and their measured development ranking.
- Assigned region launch costs, region materialization costs, selective consumers, fanout, small producers and counterhypothesis exploration.
- Raised operational allowances; no tight token-cost constraint motivated this batch.
- Added script 453 to deduplicate accepted artifacts and prepare the existing compilation/evaluation path.

### Why
- Distinct hypotheses and feedback offer more information than repeating the original blind proposal batch.
- The evaluator and GPU measurement path remain shared, with GPU work serialized.

### What worked
- All six owners exited successfully and each consumed six proposal slots.
- Accepted artifact counts were 6, 6, 6, 5, 6 and 5 across the lane receipts; 33 unique artifacts remain after cross-lane deduplication.
- Longest lane elapsed time was 21.260461628 seconds; shortest was 8.544991329 seconds.

### What didn't work
- Two submission slots did not produce unique accepted artifacts. Their original outcomes remain in the per-lane ledgers.
- These policies still operate within the existing fusion grammar; this is not new arbitrary compiler-pass synthesis.

### What I learned
- Six-lane proposal generation is practical with this route. Compilation and performance evaluation now determine whether the expanded search is useful.

### What was tricky to build
- Cross-lane duplicates must remain traceable to their origins while avoiding redundant policy compilation. origins.json preserves that mapping.

### What warrants a second pair of eyes
- Do not equate 33 distinct policy programs with 33 distinct executables or improvements.

### What should be done in the future
- Poll the existing compilation session, evaluate qualified candidates on bling, and use changed-executable and timing results to decide whether to extend the transformation grammar.

### Code review instructions
- Inspect scripts 452–453, pi-six-lanes-v1/summary.json and pi-six-lane-study-v1/origins.json.

### Technical details
- Six concurrent inference processes, independent six-proposal ledgers; no simultaneous GPU benchmarks.
- Existing development corpus and prior timing feedback; no fresh held-out claim.

## Step 173: Find a positive selective-fusion policy in the six-lane GPU experiment

The six-lane search produced a positive development result: glm-28 achieved a family-balanced synchronized end-to-end speedup of 1.285583430086401 across twelve training graphs. All policies remained eligible with no selector failures. The winner originated from selective-consumer attempt six and combines aggregate threshold 1.02 with consumer threshold 2.0. It changes six training graphs, increasing their kernel counts by one. Repetition and generalization remain untested.

### Prompt Context
**User prompt (verbatim):** "you can experiment with thinking lvels btw as well"
See Steps 168–169 for concurrent-lane and research-first instructions.
**Assistant interpretation:** Measure the running batch and make thinking level an explicit variable for subsequent experiments.
**Inferred user intent:** Improve research throughput and investigate how reasoning affects optimization proposals.
**Previous commit:** 321e619 — Run six concurrent GLM hypothesis lanes with measured feedback.

### What I did
- Polled the original compilation job to completion: 35 policies across twenty graphs qualified.
- Staged and executed the existing isolated GPU evaluator on the twelve training graphs.
- Collected measurement and terminal receipts and ran the existing selector.
- Made Pi thinking level configurable, recording requested and effective levels in session_ready. Syntax validation passed; new levels have not yet been exercised.

### Why
- The positive result must come from measured executable performance, not proposal count or structural novelty.
- Recording effective thinking settings will make SDK clamping visible in future comparisons.

### What worked
- GPU evaluation completed all twelve graphs. glm-28 ranked first at 1.285583430086401; no other candidate exceeded baseline in the aggregate.
- The winning policy is small and interpretable: selective consumer threshold 2.0, aggregate threshold 1.02.
- The run used fresh baseline timings and shared exact aliases as intended.

### What didn't work
- Many candidates were aliases or substantial regressions; the lowest aggregate was approximately 0.2134.
- Earlier commentary attributed broad graph changes to region policies before checking their kinds. Several such changes actually came from selective policies; policy artifacts are authoritative.
- No repeated-run or unseen-family confirmation has been performed for the winner.

### What I learned
- More kernels can accompany faster execution. The winner increases kernel counts on six training graphs, motivating examination of the fusion boundaries and resulting schedules.
- The first blind batch's negative result did not imply the existing selective grammar lacked useful policies.

### What was tricky to build
- The running measurement bundle retained its original source snapshot before the thinking-level configuration edit, preserving the interpretation of this run.

### What warrants a second pair of eyes
- Check per-graph contributions and repeat the winner. The 33-candidate development search can select noise and population-specific effects.
- Explain the source-level mechanism before promoting this policy into the compiler default.

### What should be done in the future
- Repeat baseline versus glm-28, inspect the changed kernels, and test additional graph families.
- Publish this substantive milestone in the vault. Explore two hypotheses at low/medium/high thinking as a separate six-lane batch after the measured result is understood.

### Code review instructions
- Read pi-six-lane-results-v1/selection.json and measurement.json, then pi-six-lane-study-v1/corpus/policies/glm-28.json and origins.json.

### Technical details
- Development result under the modified explicit FP32 protocol; not native PassBench score or fresh held-out evidence.
- Thinking-level configuration defaults to off for existing configurations; new requests can specify thinkingLevel explicitly.

## Step 174: Repeat the gain and identify matrix scheduling as the next hypothesis

A fresh isolated run of the identical candidate set again selected glm-28, scoring 1.2873976889929954 versus the first run's 1.285583430086401. The development gain repeats. Per-graph analysis shows four wins, two regressions and six exact aliases. The largest observed improvement is approximately 19.01x on one graph; one regression is approximately 0.408x. This concentration rules out interpreting the aggregate as uniform improvement.

### Prompt Context
See Steps 168–169 and 173 for research-first priorities, concurrency and thinking-level experimentation.
**Assistant interpretation:** Repeat the measured result and explain which compiler behavior warrants further research.
**Inferred user intent:** Find reusable improvements rather than promote a lucky aggregate.
**Previous commit:** ec3c154 — Measure 1.286x development gain from GLM selective fusion policy.

### What I did
- Added script 454 to extract the original immutable evaluation bundle into a fresh remote run directory and repeat GPU measurement.
- Collected repeated timing/terminal receipts and recomputed the ranking.
- Added script 455 to relate changed-graph timings to actual kernel schedules and shapes.

### Why
- Repetition addresses run variability; inspecting kernel changes provides a concrete optimization hypothesis.

### What worked
- Both runs select glm-28 with closely matching aggregate scores; the repeated ranking records no candidate failures.
- Graph 3 changes a fused row-mapped matrix/layout kernel into a tiled matrix kernel plus layout conversion, reducing observed end-to-end time from 1.17646 ms to 0.0618875 ms in the first run.
- Graph 10 similarly switches to MAP=tiled,BM=32,BN=16,BK=8 plus a separate layout kernel and improves approximately 1.568x.

### What didn't work
- Graph 11 regresses from 0.0844555 ms to 0.207151 ms; its separated matrix kernel remains row-mapped, using TPB=128,STAGE=all.
- Repetition on the same development population establishes neither unseen-family generalization nor a universally beneficial policy.

### What I learned
- Preserving a matrix operation until scheduling can enable a profitable tiled implementation. Fusion changes scheduling opportunities as well as launch count.
- The next targeted hypothesis is to prevent layout fusion where it destroys profitable matrix tiling, while retaining fusion where separation supplies no better schedule.

### What was tricky to build
- The repeat uses unchanged compiled inputs and evaluator source; only run ownership/name differs. Current uncommitted implementation choices cannot affect its kernels.

### What warrants a second pair of eyes
- Schedule differences are observed evidence, but attributing the entire speedup to tiling requires a controlled compiler ablation.

### What should be done in the future
- Design a matrix/layout-aware profitability decision or schedule comparison, then test it against both the winner's gains and regressions.
- Confirm on additional families and publish the substantive milestone report.

### Code review instructions
- Inspect scripts 454–455, pi-six-lane-repeat-results-v1/selection.json and pi-selective-winner-analysis-v1.json.

### Technical details
- Fixed development population and modified explicit FP32 protocol; no default compiler promotion.
- Baseline and candidate share measurements only when their executable fingerprints are identical.

## Step 175: Publish the repeated selective-fusion result as a technical article

Published a 2,280-word textbook-style article explaining the actual Pi/GLM pipeline, six-lane experiment, repeated positive result and matrix/layout scheduling hypothesis. The new vault article was committed and pushed as 2d407b6b700461b54b542130364c37edab2d1eaa. Earlier reports and unrelated vault changes remain untouched.

### Prompt Context
See the standing milestone report request and Steps 168–174 for current research direction.
**Assistant interpretation:** Preserve the substantive result in a self-contained technical explanation.
**Inferred user intent:** Make the research understandable and reusable beyond the session.
**Evidence commit:** d1f1b42 — Repeat selective fusion gain and identify matrix scheduling effects.

### What I did
- Applied the Obsidian vault-writing and textbook-authoring skills.
- Created reference 25 through docmgr and wrote a source copy with the same article body.
- Defined graph, pass, policy and scheduling concepts before tracing a concrete measured example.
- Included architecture, policy JSON, objective equation, proposed algorithm pseudocode, evidence locations and limits.
- Verified both aggregate values against selection receipts, then committed and pushed the new vault article.

### Why
- The repeated improvement is a meaningful milestone, while its mixed per-graph behavior needs careful explanation.

### What worked
- Both recorded aggregate values match the article's rounded results.
- Vault push succeeded to main at 2d407b6b700461b54b542130364c37edab2d1eaa.

### What didn't work
- No publication failure occurred. cp -n emitted a portability warning; the new file was copied and committed successfully.
- No claim of unseen-family generalization, native PassBench scoring or arbitrary compiler-pass synthesis was added.

### What I learned
- The explanatory sequence is clearest when policy semantics precede the distinction between executable novelty and measured improvement.

### What was tricky to build
- The report distinguishes observed schedule changes from a causal explanation that still requires ablation.

### What warrants a second pair of eyes
- Review the concentration of gain in one graph and the proposed matrix/layout-aware rule.

### What should be done in the future
- Implement and measure a targeted compiler hypothesis; test additional graph families and thinking levels.

### Code review instructions
- Read reference 25 or the vault article, then follow its evidence table to the actual measurements and generated schedules.

### Technical details
- Vault path: Projects/2026/10/31/ARTICLE - Kiln - Six GLM Lanes and Matrix Layout Fusion.md.
- Article body: 2,280 whitespace-delimited words, one Mermaid diagram, concrete JSON and proposed pseudocode.


## Step 176: Reject the simple contraction-eligibility hypothesis

Implemented and exercised an opt-in fusion-edge predicate that preserves a producer's contraction eligibility when fusion would remove it. On development graphs 3, 10 and 11, the rule produced the same schedules and kernel counts as baseline. This hypothesis does not explain the winner's behavior. Preserved the experimental patch and outputs, then restored the compiler files to avoid retaining an ineffective API extension.

### Prompt Context
See Steps 169 and 173 for research-first direction and the scheduling hypothesis.
**Assistant interpretation:** Test a concrete compiler mechanism before expanding the interface.
**Inferred user intent:** Learn from executable experiments and consolidate architecture.
**Starting commit:** 56f6f9c — Publish technical report on repeated selective fusion gains.

### What I did
- Inspected loop fusion and tile.analyze contraction recognition.
- Temporarily added an acceptEdge predicate to createFusionRule and a tile-level contraction-preserving rule factory.
- Added script 456 to compile baseline and experimental forms of graphs 3, 10 and 11 with reference checks.
- Ran the existing selective-fusion test successfully.
- Archived experimental-rule.patch and reverted only the two compiler files changed by this experiment.

### Why
- A tiling-eligibility test was a direct, inexpensive probe of the proposed mechanism.
- A negative result should narrow the next experiment without permanently expanding compiler APIs.

### What worked
- All six probe compilations passed local reference checks; the existing selective-fusion test passed.
- Output artifacts establish identical selected schedules for default and preserve variants on all three graphs.

### What didn't work
- The proposed predicate did not expose the winning schedules. No GPU rerun was warranted for this unchanged-schedule probe.

### What I learned
- Preserving the presence of a contraction is insufficient. The next investigation should inspect the contraction dimensions and estimated costs of legal tiled schedules before and after fusion.

### What was tricky to build
- tile.js already depends on loop.js, so the experimental factory lived at the tile layer instead of introducing a reverse dependency into loop fusion.

### What warrants a second pair of eyes
- Distinguish scheduling legality from cost-model ranking. The current evidence does not prove the cost model is the sole cause.

### What should be done in the future
- Compare contraction dimensions and schedule estimates for fused and materialized forms; test schedule-aware profitability or a better representation.

### Code review instructions
- Review script 456 and sources/contraction-preservation-probe-v1/results.json, then the archived patch. Replaying the script requires applying that patch to the recorded starting revision.

### Technical details
- Production compiler files were restored exactly to HEAD. No default behavior changed and no performance gain is claimed.
