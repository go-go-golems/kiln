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
