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
