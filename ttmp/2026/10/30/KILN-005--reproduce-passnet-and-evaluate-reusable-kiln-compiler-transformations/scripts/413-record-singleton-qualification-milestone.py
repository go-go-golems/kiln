#!/usr/bin/env python3
"""Update the authoritative current overview and preserve complete terminal qualification."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';facts=json.loads((s/'singleton-view-source-cohort-v1-verified-facts.json').read_text());coverage=json.loads((s/'kiln-coverage.json').read_text());assert (coverage['tasks_verified'],coverage['graphs_verified'],coverage['graphs_in_complete_tasks'])==(31,358,289)
roadmap=p/'reference/03-project-roadmap.md';text=roadmap.read_text();cut=text.index('### Fresh conditional-policy checkpoint');current=text[:cut]
current=current.replace('Twenty-seven complete tasks / 338 individually passing graphs','31 complete tasks / 358 individually passing graphs').replace('1,196 graph imports / 69 complete families','1,251 graph imports / 76 complete families').replace('No configured provider; local serving feasibility documented','One declared50-step local run terminal; seven no-match evaluations; full population pending')
start=current.index('The user explicitly requested streamlining toward self-optimization.');end=current.index('\n\nThe initial self-optimization dependency',start)
current=current[:start]+'''The user explicitly requested streamlining toward self-optimization. Full200-task compiler support remains an active track, not a prerequisite for the first reusable-policy experiment. Current cumulative nominal replay acceptance is31 complete tasks containing289 graphs, with358 individually passing graphs including partial tasks. Import eligibility is1251 graphs/76 complete families. Reference21 and singleton-view-source-cohort-v1-verified-facts.json own the newest qualification; kernel correctness and complete task acceptance remain separate gates.\n'''+current[end:]
roadmap.write_text(current+text[cut:]+'''\n\n### Complete singleton qualification and terminal reference audit\n\nAll seven frozen families/55 variants are accounted for under a040057. Twelve native fixture programs pass72 exact finite output comparisons. Four complete tasks and20 individual graphs pass nominal t=-5, two evaluated graphs fail that criterion, and33 variants remain unexecuted after an export check stops their family. Cumulative replay reaches31 tasks/358 graphs (289 in complete tasks), while import eligibility is1251/76. The original50-step agent run is terminal with seven no-match evaluations and a placeholder top-level reward excluded from scoring. Exact DGX tracing diagnosis is confirmed. Reference21 and diary146 own the current milestone; full support/reproduction and numerical repairs remain open.\n''')
guide=p/'design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md';text=guide.read_text();start=text.index('The checked-in paper is');end=text.index('\n\nThe requested end state',start)
text=text[:start]+'''The checked-in paper is arXiv:2605.29357v1. Reference source revision is `61c64709f6d324216ae8252cec3cdc35b2dd5da5`; dataset revision is `4f7dd9211178327c2718f1b828d83ea126186f9e`. Sources and acquisition receipts are under `../sources/`. Current cumulative replay accepts31/200 complete tasks and358/2060 individual graphs (289 inside complete tasks) at nominal t=-5, under declared modified integration protocols. This is not a uniform current-release full-corpus rerun. Import eligibility is1251 graphs/76 complete families. Reference21 and the roadmap are the current evidence entrypoints.\n\nThe original agent now has a completed50-step local smoke trajectory, with seven no-match evaluations and no accepted candidate. Its top-level reward1.0 is a documented placeholder; the actual evaluator score is0.1. The original source tracer mismatch is confirmed on the exact DGX image. Design18/reference21 distinguish the original run from the normalized Kiln integration. The owned serving process is stopped.\n\nSections11–40 preserve implementation checkpoints and their then-current results; read their status statements as historical. Sections2–10 define the core architecture/contracts, and Section41 describes the latest source-view extension and terminal evidence. Direct reusable-policy studies and a fixed compiler rewrite have already received held-out measurements; the latter's fresh exact-model FP32 confirmation measures1.053746x e2e under its declared research protocol. That result is independent of native PassBench support and does not close broader LLM-generated transformation synthesis.\n'''+text[end:]
text=text.replace('createFusionRule({maxWorkGrowth=1.02, decide=null, onDecision=null})','createFusionRule({maxWorkGrowth=1.02, decide=null, selectConsumers=null, onDecision=null})')
text=text.replace('Split workloads by graph family before policy selection.', 'The optional selectConsumers callback chooses a consumer subset through the same legality/lifetime boundary; the whole-region planner is in std/fusion.js. Bounded declarative policies are compiled by integrations/passnet/fusion_policy.mjs. These interfaces reuse the compiler rule rather than introduce another fusion engine.\n\nSplit workloads by graph family before policy selection.',1)
text+='''\n\n## 41. Singleton views and the distinction between qualification gates\n\nThe source binder supports static unsqueeze/squeeze in method, public and ATen forms by computing the required shape and reusing N.reshape. Negative axes, scalar conventions, selected non-unit dimensions, empty axis lists, duplicate axes, dtype agreement and metadata consistency are checked explicitly. Views never grant new fresh-storage ownership. Design15 gives the coordinate proof and primary-source provenance; no upstream implementation was copied.\n\nAll57 FX tests and all72 finite CUDA output comparisons pass. Full seven-family qualification preserves55 variants:20 nominally pass, two fail numerical acceptance and33 are unexecuted after an export check. Four tasks are completely accepted, adding16 graphs inside complete tasks and four more accepted graphs inside incomplete tasks. Read reference21 and singleton-view-source-cohort-v1-verified-facts.json before using31/358 cumulative support counts. No performance/generalization claim follows from importing an operator.\n\nThe original reference-agent trajectory must be interpreted through actual pass_evaluator observations, not its stub reward. Script394 preserves all seven real scores and saved pass files. Script398 shows ordinary/forced/both-normalized match counts1/0/1 for CPU and CUDA with original task shapes on the exact image. This diagnostic control does not modify original evaluation or make the saved empty kernel correct. Paper-version runtime confirmation and any separately declared repaired reference remain open.\n''';guide.write_text(text)
with (p/'design-doc/15-singleton-reshape-index-maps-and-contraction-visibility.md').open('a') as file:file.write('''\n## Complete singleton source qualification\n\nUnder committed a040057,12 independent CUDA programs pass72 finite output comparisons with zero error. The full seven-family/55-variant replay accepts four complete families and20 individual graphs at nominal t=-5. Two other evaluated graphs fail the strict numerical point, while33 variants remain unexecuted because their complete family stops at an end-to-end export check. No threshold changes or family filtering occur. Source/artifact/log/scorer identity and all165 source files are verified. Cumulative replay reaches31 complete tasks/358 individual graphs, with289 inside complete tasks; import eligibility remains1251/76. Reference21 explains scope and retained failures.\n''')
with (p/'design-doc/18-original-passagent-on-a-pinned-local-model-with-complete-evaluation-membership.md').open('a') as file:file.write('''\n## Token budget and paper-version source inspection\n\nThe131072 field is the agent-run token budget; original model_query does not pass max_tokens to LiteLLM. The maximum observed prompt is34415 within the40960 serving context, so this run does not establish context overflow. Archived PyTorch2.9.1 matcher source performs schema-based args/kwargs reconciliation for OpOverload targets, while a Python functional ReLU follows its exact argument-form comparison. This is static source evidence, not a reproduction of the complete paper-version Dynamo/CUDA environment. Reference21 preserves that distinction.\n''')
entry='''
## Step 146: Qualify the full singleton cohort and audit its exact failure accounting

The committed source checkpoint a040057 is qualified through independent CUDA views and the complete frozen seven-family population. Four families and20 individual graphs pass nominal acceptance; two evaluated graphs fail numerically and33 variants remain unexecuted after their family stops at an export check. The cumulative ledger reaches31 complete tasks/358 individual graphs, with289 in complete tasks. Import eligibility remains1251/76, not execution support.

The original50-step reference run and exact-runtime matching diagnosis are now incorporated into reference21. The report explains the real penalty score versus placeholder reward and keeps the reference protocol separate from the modified Kiln integration. Publication follows after this complete report/evidence checkpoint is committed.

### Prompt Context
See the standing request for complete implementation/measurement, detailed diaries, provenance and milestone textbook-style vault reports. Step145 records the terminal original-agent audit. Runtime metadata is continuation context rather than a new authored user request.
**Assistant interpretation:** Finish complete-family qualification, retain all failures and publish a coherent current-state account instead of promoting import success to accepted support.
**Inferred user intent:** Advance the full200-task goal with reproducible compiler evidence and a trustworthy original-agent comparison.
**Commit (compiler):** a0400576e1eafd20ce018db903e6e0639a92ee62 — source singleton views and terminal reference audit.

### What I did
- Scripts400–403 export12 independent fixture models, stage exact committed source and every declared family/variant, then launch one named qualification job.
- Observed terminal first-launch import failure, preserved its log and diagnosed the missing kiln_launch module path. Scripts406–407 reuse the compiled artifacts with the documented explicit runtime path.
- All12 native programs pass72 finite output comparisons with zero error before the complete55-variant corpus run starts.
- Collected only after run.json is terminal and its tmux session is missing; final source bytes match the staged committed snapshot.
- Reused summarize_task_run.py for nominal matching/numerical accounting; script411 verifies165 source files,24 compilation attempts,23 artifacts, all graph membership and scorer/log identities.
- Added this terminal cohort to the existing ordered coverage builder, preserving prior coverage as coverage-before-singleton-views.json.
- Consolidated the current guide/roadmap overview, labeled historical checkpoint sections, updated the actual fusion factory signature and wrote detailed reference21.
- Generalized the existing vault publisher into script387-publish-vault-report.py, requiring a committed source report and staging only one intended note rather than adding another hardcoded publisher.

### Why
- Independent singleton-copy correctness does not establish arithmetic correctness in every larger composition, and compilation success alone is not original evaluator acceptance.
- Complete-family accounting must include unexecuted variants after a gate failure. Selecting only passing shapes would change the task.
- Current guide statements had fallen behind appended history; one authoritative current overview avoids contradictory progress counts for a new intern.

### What worked
- All57 FX tests and all72 finite native output comparisons pass. Four complete families contain16 graphs; four additional accepted graphs belong to two incomplete families.
- Full cohort:55 variants =20 nominally accepted +2 evaluated numerical rejections +33 unexecuted. Complete accepted tasks are indices39,103,138,190.
- Cumulative ledger:31/200 complete tasks,358/2060 individual graphs,289 graphs inside complete tasks. No import regressions;1251/76 remains a distinct eligibility metric.
- Exact runtime diagnostics verify the original pattern-tracer asymmetry on CPU/CUDA and original/small shapes. The original reward stub and all seven no-match evaluations remain visible.
- Both old and final remote source snapshots match165 committed files; native fixture source hashes are checked against actual committed generated scripts.

### What didn't work
- First fixture launch fails before native execution: ModuleNotFoundError: No module named 'kiln_launch'. This repeats a known launcher-path requirement; the diagnosed recovery supplies PYTHONPATH explicitly and succeeds. No compiler source or tolerance changes are used to recover it.
- Task10's FP16 S-ViPNAS-Res50 variant fails with ': end-to-end check FAILED'. One earlier artifact exists, but none of the33 family variants receives original evaluation. Their cause remains unresolved.
- Task88 has one FP32 original numerical failure at-5/-4, passing-3; task95 has one FP16 failure at-5, passing-4. Each executes one replacement, so they are numerical rather than matching failures. They remain rejected at nominal-5.
- First final-verifier attempt raises KeyError: 'source_sha256' for an independent fixture manifest. That field belongs to generated task manifests; the corrected verifier binds each actual fixture script to its committed bytes and artifact hash instead of assuming the wrong schema.

### What I learned
- The first33-variant family dominates unexecuted accounting. Its first successful compile cannot be counted as an accepted graph without original replay.
- The retained agent best snapshot is from strict score improvement; all seven scores tie, preserving the initial empty kernel. It does not establish that all later edits were identical.
- The131072 token limit is a run budget, not an outgoing request max_tokens parameter. Paper-version matcher source inspection does not prove complete paper-runtime behavior.

### What was tricky to build
- Three separate populations require explicit identities: independent native fixtures, full newly complete families, and the shipped original-agent smoke. They validate different properties and must not share misleading success counts.
- The source checkpoint remains unchanged during measurement, while versioned launch recovery and post-run audit code are retained separately. Staging guards now also reject overwriting sources during named qualification sessions.

### What warrants a second pair of eyes
- Review task10's protected export failure and both strict numerical rejection curves before designing a precision repair.
- Confirm that all55 graph identities remain in the accounting and that graph counts inside complete tasks increase by16 rather than20.

### What should be done in the future
- Resolve33 unexecuted variants and the two strict numerical failures; taskpis5 remains open because all seven families are not qualified.
- Confirm paper-version reference matching and declare any repair separately, then expand original-agent evaluation and reusable compiler synthesis.
- Consolidate native validation startup in the shared CLI after this measurement checkpoint to prevent repeated import-path launcher mistakes.
- Publish reference21 append-only to the vault and verify its committed/remote bytes. Updated reMarkable delivery remains pending the earlier explicit approval request.

### Code review instructions
- Start with singleton-view-source-cohort-v1-verified-facts.json, coverage-before-singleton-views.json, current kiln-coverage.json and reference21.
- Inspect scripts400–411, source staging/final verification, independent native artifacts, original scorer receipts and preserved failed compile log.

### Technical details
- Both named qualification sessions are terminal; the model server is stopped. No replacement live job is inferred from a state file alone.
- This is cumulative modified-protocol support evidence, not a uniform release run, successful original-agent kernel or fresh compiler-policy speedup claim. The full objective remains active.
'''
with (p/'reference/01-detailed-investigation-diary.md').open('a') as file:file.write(entry)
