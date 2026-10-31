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
