---
Title: Diary
Ticket: KILN-009
Status: active
Topics:
    - kiln
    - compiler
    - gpu
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/corpus.py
      Note: expose_inplace_results, --mutation-strategy passthrough
    - Path: repo://integrations/passnet/fx_normalize.py
      Note: DUNDER_ALIASES
    - Path: repo://integrations/passnet/generate_pass.py
      Note: drop_dead_statements returns kept unused in-place results
    - Path: repo://packages/kiln/src/std/export.js
      Note: mutation loop, loopIrOf, mutationStrategy
    - Path: repo://packages/kiln/src/std/inplace.js
      Note: planMutation, sameIndexSlots, storeInjective, retargetProducer, compactBuffers
    - Path: repo://packages/kiln/src/std/program-sim.js
      Note: simulateProgram and AliasWatch
    - Path: repo://packages/kiln/test/inplace.mjs
      Note: unit and oracle tests
    - Path: repo://ttmp/2026/11/01/KILN-009--kiln-direct-writes-of-mutated-inputs-intern-analysis-design-and-implementation-guide/sources/mutation-oracle.json
      Note: corpus oracle results
    - Path: repo://ttmp/2026/11/01/KILN-009--kiln-direct-writes-of-mutated-inputs-intern-analysis-design-and-implementation-guide/sources/mutation-plan-table.json
      Note: corpus strategy table (113/114 direct)
ExternalSources: []
Summary: Chronological investigation diary for the KILN-009 direct-writes-of-mutated-inputs research and guide.
LastUpdated: 2026-11-01T07:31:56.997578195-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

This diary records the research behind the KILN-009 design guide on writing mutated inputs directly from their producer kernels. Each step follows the investigation format: prompt context, what was done, what worked and failed, and what a reviewer should check.

## Step 1: Orientation, skills and the existing write-back commit

I loaded the workflow skills (ticket-research-docmgr-remarkable with its writing-style and deliverable-checklist references, textbook-authoring, docmgr, diary with the investigation-entry reference), inspected the empty KILN-009 ticket, and read commit 2be8918, which introduced the current write-back mechanism. The commit is the starting point of the design: it shows exactly where a mutation is turned into an extra kernel and how the runtime binds the input tensor to that kernel's destination buffer.

While this step was in progress the coordinator relayed a new user instruction requiring each agent to keep its own diary in investigation format as it works. I created this diary immediately and am writing one step per research phase from here on.

### Prompt Context

**User prompt (verbatim):** "Create new docmgr tickets for tensor-core matrix products  and fused attention and cumsum and writing mutated inputs (one docmgr + design doc per task). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Earlier user question (verbatim):** "and can we build them with CPU only"

**Later user instruction (verbatim, relayed by the coordinator mid-task):** "tell each agent to use their own diary and to folow the diary format as they go"

**Assistant interpretation:** Write the KILN-009 intern guide (design doc) and an investigation-format diary inside the existing ticket, relate key files, add phase tasks and a changelog entry, and get docmgr doctor clean. The parent agent uploads to reMarkable, so this agent does not.

**Inferred user intent:** A new engineer should be able to implement the in-place-write optimization and the family 162 dead-code fix from the guide alone, and should know which parts can be built and validated without a GPU.

**Commit (code):** none; this is a documentation-only task and the instructions forbid committing.

### What I did

- Read the five skill files listed in the task brief.
- Ran `find` on the ticket directory and read index.md, tasks.md and changelog.md (all template content).
- Ran `git show 2be8918` and `nl -ba packages/kiln/src/std/export.js` (111 lines).
- Read `integrations/passnet/runtime.py` and `integrations/passnet/dispatch.py` with line numbers.
- Created this diary with `docmgr doc add --ticket KILN-009 --doc-type reference --title "Diary"`.

### Why

- The write-back commit is the only existing implementation of input mutation in the Kiln export path, so the design must start from its exact contract rather than from the task brief's summary.

### What worked

- `export.js:37-47` defines `writebackKernel(from, to)`; `export.js:98-105` appends it once per mutation and sets `o.buffer = i.buffer`; `export.js:102` skips the kernel when the output already is the input buffer.
- `runtime.py:32-43` binds every input tensor to its buffer id and reuses that tensor for any output whose buffer is an input buffer, which is what makes `dispatch.py:82-84` (`outputs[out] is inputs[i]`) hold.

### What didn't work

- `docmgr doc add --ticket KILN-009 --doc-type design-doc --title "Direct writes of mutated inputs: analysis, design and implementation guide"` did not finish within the 120 s tool timeout and was moved to the background. The diary `doc add` immediately before it succeeded. Likely cause (not verified): other agents run docmgr concurrently in the same repository. I let the background command finish rather than starting a second copy.
- A grep with `--include=*.py` failed under zsh with `(eval):1: no matches found: --include=*.py` because the glob was unquoted; it must be quoted.

### What I learned

- The write-back kernel is CUDA-only (`wgslUnavailable`, `export.js:46`), so a mutated program cannot run on the WebGPU target today.
- The current proof of safety is a comment, not a check: `export.js:35` asserts that every read of the original value is an earlier launch, which holds only because the write-back kernel is appended last.

### What was tricky to build

- Nothing built yet. The subtle point identified so far is that `o.buffer = i.buffer` re-points only the mutation's output record; any other output or kernel that reads the producer's buffer still reads the scratch buffer, which stays correct for write-back but must be handled explicitly by a direct-write rewrite.

### What warrants a second pair of eyes

- Whether any existing artifact has two outputs naming the same producer buffer as a mutation output; direct writes would have to re-point both.

### What should be done in the future

- Continue reading the importer (fx_import.py), corpus.py, generate_pass.py, the KILN-005 result document 50 and the audit file.

### Code review instructions

- Start at `packages/kiln/src/std/export.js:98-105` and `integrations/passnet/runtime.py:32-43`.

### Technical details

- kiln-program/1 kernel record fields used by write-back: `name, identity, row, reads[], writes, grid, block, smemBytes, dispatch, shape, inShapes, inDtypes, cuda`.

## Step 2: Importer, corpus, pattern generation and the GPU evidence

This step traced a mutation from the FX source graph to the manifest record and the generated PassBench rule, then read the KILN-005 evidence. The aim was to find out which graphs reach the write-back path and why the remaining families fail. The main result is that the evidence splits into three groups: graphs the write-back already serves, families no replacement can pass (the shared-input limit), and family 162, which never reaches Kiln because its rule cannot be constructed.

The brief named family 57 as a fifth accumulating family. Reference 50 lists only four (94, 111, 172, 176). I checked 57 directly instead of copying the brief.

### Prompt Context

**User prompt (verbatim):** see Step 1. The mid-task diary instruction ("tell each agent to use their own diary and to folow the diary format as they go") is also recorded in Step 1.

**Assistant interpretation:** Verify the brief's claims about the importer, corpus and generate_pass against the code, and gather the GPU evidence the design depends on.

**Inferred user intent:** The guide must rest on cited code and measured results, not on the coordinator's summary.

**Commit (code):** none.

### What I did

- `grep -n` and `nl -ba` over `integrations/passnet/fx_import.py` (Context at 581-646, the graph walk at 663-740), `corpus.py` (translate_graph 43-94, eliminate_dead_code 97-114, compile_task 163-186) and `generate_pass.py` (all 206 lines).
- Read KILN-005 `reference/50-input-mutation-replay-result-and-the-shared-input-limit.md`.
- Summarized `sources/tf32-rne-requal-gpu-v1/results-audit.json` per family with a short `python3 -I` script, and grepped `results/task-162/benchmark.log` for the matcher error.
- Read the 162 source model (`.../jinaai_jina-reranker-m0_start2_end15_1/model.py`), the generated `passes/KilnPattern0000.py` and the 162 corpus manifest.
- Checked family 57 in `sources/composed-ops-replay-gpu-v1/results-audit.json` and read its source model and benchmark log.
- Read `pass_bench/torch/posion_dispatch_tensor.py` (48-136) and `test_compiler.py::test_single_model` (240-298), plus `torch.fx` `SubgraphMatcher.__init__` and `Node.is_impure` from the installed torch 2.11.

### Why

- A direct-write design changes only the export step, but its value depends on how many graphs carry a mutation and on which failures are caused by Kiln and which by the harness.

### What worked

- The importer records an input mutation only when the input has exactly one use (`fx_import.py:644`). Every other read of the input must therefore come from Kiln's own fusion (recomputation), never from the FX source.
- Family 57 is a fifth accumulating family: its source has `in_3 += einsum(...)` followed by `tmp_3 = in_3 * in_0`. All 6 graphs execute (`correct` execution status) but none is accepted, and the benchmark log shows max_diff 0.248. This is the same shared-input signature as 94, 111, 172 and 176. It entered the census later (composed-ops replay), which explains why reference 50 omits it.
- Family 162 compiles: `compile.log` shows returncode 0 for all six scripts. Every graph fails with `[PassMgrBackend] Pass KilnPattern0000 CRASHED with error: SubgraphMatcher cannot be initialized with an pattern with dead code`.
- `SubgraphMatcher.__init__` raises for any node with `len(node.users) == 0` unless `node.is_impure()`. In torch 2.11, `is_impure` returns False for every `call_method`, so an unused `masked_fill_` method call counts as dead code.

### What didn't work

- `tail ttmp/2026/10/30/KILN-005*/.../task-162/compile.log` failed with `No such file or directory`. A glob inside a variable assignment is not expanded, so I resolved the directory with `$(ls -d ...)` first.

### What I learned

- `drop_dead_statements` (`generate_pass.py:55-61`) keeps `tmp_4 = tmp_2.masked_fill_(tmp_3, 1)` because its receiver `tmp_2` is live. It does not return `tmp_4`, so the traced pattern contains a node without users.
- `PosionDispatchTensor` admits only creation, alias and `_to_copy` operators plus metadata queries (`posion_dispatch_tensor.py:69-131`), and raises for everything else (134-136). This is why the dispatcher cannot call `copy_`.

### What was tricky to build

- Nothing built. The subtle point is that the 162 failure is not a mutation of an input: `masked_fill_` updates a fresh intermediate. It shares the dead-code mechanism with mutations but not the write-back path.

### What warrants a second pair of eyes

- Whether other families have the same unused in-place result. KILN-005 reference 44 reports the same matcher error for task 128, but with a different cause (a dead conv branch), so a single fix will not cover both.

### What should be done in the future

- Reproduce the 162 failure on CPU and test the proposed fix (Step 3).

### Code review instructions

- `integrations/passnet/generate_pass.py:36-62`, `integrations/passnet/fx_import.py:640-646` and `:709-718`.

### Technical details

- 162 source: `tmp_4 = tmp_2.masked_fill_(tmp_3, 1); tmp_3 = tmp_4 = None` followed by `return (tmp_13, tmp_7)`.
- tf32-rne-requal-gpu-v1 audit: 15 tasks, 183 graphs, 8 tasks and 155 graphs nominally accepted. Family 162 has 6 graphs, all `eager_fail`.

## Step 3: CPU experiments on family 162 and on kernel reads of a mutated input

This step ran four small experiments on this CPU-only host (torch 2.11.0+cu130, `torch.cuda.is_available() == False`), stored as numbered scripts in the ticket's `scripts/` directory. Two of them found facts that change the design. First, family 162 has a second blocker besides the dead-code assertion: a spelling mismatch for `==`. Second, a fused kernel can read the mutated input at indices other than the one it writes, which is exactly the in-kernel hazard the design has to refuse.

### Prompt Context

**User prompt (verbatim):** see Step 1 (including the earlier question "and can we build them with CPU only").

**Assistant interpretation:** Settle by experiment the claims that can be settled without a GPU.

**Inferred user intent:** Show which parts of the work need the GPU and which do not.

**Commit (code):** none.

### What I did

- `scripts/01-reproduce-162-dead-code-pattern.py MODEL_PY [--return-inplace]` runs `generate_pass.extract_pattern` on the 162 source, traces the pattern and constructs the upstream `SubgraphMatcher`. With `--return-inplace` it appends each kept, unused in-place result to the return tuple (the proposed fix).
- `scripts/02-dynamo-capture-162.py GRAPH_DIR [--meta-device]` captures the target graph with TorchDynamo on meta tensors, as KILN-005 script 658 does.
- `scripts/03-match-fixed-162-pattern.py GRAPH_DIR [--canonical-eq]` matches the fixed pattern against the Dynamo target, with both sides rewritten to `device(type='meta')`.
- `scripts/04-kernel-reads-of-mutated-input.mjs` exports four small mutation programs through the real pipeline (rtx5090 target) and prints every kernel's reads and writes, marking the input's buffer. I also printed the CUDA of two producer kernels from a scratch script.

### Why

- The brief's proposed fix for 162 (return the kept in-place result) had not been tested. Script 658 is the CPU stand-in for PassBench rule selection, so the fix can be tested without a GPU.
- The launch-order proof can only be designed against real kernel lists, not imagined ones.

### What worked

- Script 01 without the fix reports `nodes without users: ['%masked_fill_ : [num_users=0] = call_method[target=masked_fill_](args = (%sub, %eq, 1), kwargs = {})']` and `SubgraphMatcher: SubgraphMatcher cannot be initialized with an pattern with dead code`. This is the evaluator's error, reproduced on CPU.
- Script 01 with `--return-inplace`: `appended in-place results to the return: ['tmp_4']`, `returns (node indices): [14, 8, 5]`, `SubgraphMatcher: constructed`.
- Script 02 with `--meta-device` shows Dynamo keeps `%tmp_4 : [num_users=0] = call_method[target=masked_fill_]` in the target graph, so the fixed pattern has a node to bind.
- Script 03 with `--canonical-eq`: `pattern returns [14, 8, 5] matches 1`, `returning nodes: ['tmp_13', 'tmp_7', 'tmp_4']`.
- Script 04 (x is buffer 0):
  - relu_ then mean: `0 k_y MAP=row reads [*0] writes 1`, `1 k___mut0 reads [*0] writes 2`, `2 k_writeback reads [2] writes *0`. Kernel 0 recomputes relu(x) inside the mean, so it reads x. It is launched before the producer, so a direct write into x by kernel 1 is safe.
  - x += y, out = x*2: `0 k___mut0 reads [*0,1] writes 2`, `1 k_out reads [2] writes 3`, `2 k_writeback`. The producer is the only reader of x, and its CUDA loads `src0[idx]` and stores `dst[idx]` with the same index expression `((e % 8) + (8 * (e / 8)))`.
  - x <- x - mean(x, -1): a single fused kernel `k_reduce_ew_reduce reads [*0] writes 1`. Its CUDA loads `src0[(8 * (e / 8)) + r0]` for every r0 in the row and stores `dst[(e % 8) + (8 * (e / 8))]`. If it wrote in place, thread e would overwrite an element that other threads of the same row still read.

### What didn't work

- Script 02 without `--meta-device`: `capture failed: RuntimeError Found no NVIDIA driver on your system.` The `.to(device(type='cuda', index=0))` call in the 162 source needs a CUDA driver even under meta tensors. This is the CPU limit the brief mentioned.
- Script 03 first returned `pattern returns [14, 8, 5] matches 0`. Printing the pattern graph showed `%eq : call_function[target=operator.eq]`, while the Dynamo target has `call_method:__eq__`. The symbolically traced pattern and Dynamo spell `in_0.__eq__(0)` differently, and `fx_normalize.canonicalize_spellings` (49-58) handles only one-argument `sigmoid`/`tanh`. After rewriting the target's `__eq__` to `operator.eq` (`--canonical-eq`), the match count is 1.
- A shell separator `echo ======` failed under zsh with `(eval):50: ===== not found` (a leading `=` triggers zsh filename expansion). It did not affect the experiment.

### What I learned

- Family 162 needs two fixes: return the kept in-place result, and canonicalize the `__eq__` spelling on the target side. Neither fix alone produces a match.
- The SIMT simulator runs each block in lockstep (`emit.js:171-173`), so every thread's loads happen before any thread's store within a block. A simulated in-place run of the x - mean(x) kernel would therefore look correct even though the CUDA kernel races across warps. Simulation is a useful test oracle, but it cannot prove that an in-place write is safe; a static rule is required.
- Every emitted CUDA kernel declares `const T* __restrict__ srcN` and `T* __restrict__ dst` (`emit.js:64`). Passing the same pointer as both breaks the `__restrict__` contract, and `const __restrict__` permits the non-coherent read-only load path. An in-place kernel must be emitted without these qualifiers on the aliased parameters.

### What was tricky to build

- To capture a graph that calls `.to(cuda)` on a CPU-only host, I copied the model to a temporary directory and replaced the device literal with `device(type='meta')` on both the pattern and the target side. This checks matcher structure only. It does not show that the CUDA graph matches, which needs the evaluator.

### What warrants a second pair of eyes

- The `__eq__` canonicalization must be applied where PassBench applies Kiln's target normalization (the log line `[kiln-normalized-fx/1] target normalization []`). The spelling choice must not create new false matches in other families.
- Whether in torch 2.12 (the evaluator's version) `Node.is_impure` still returns False for in-place `call_method` nodes. If 2.12 treats them as impure, the dead-code half of the fix is unnecessary there.

### What should be done in the future

- Write the design doc using these results (Step 4).

### Code review instructions

- Run from the repository root:
  - `python3 ttmp/2026/11/01/KILN-009-*/scripts/01-reproduce-162-dead-code-pattern.py <162 model.py> [--return-inplace]`
  - `python3 ttmp/2026/11/01/KILN-009-*/scripts/03-match-fixed-162-pattern.py <162 graph dir> --canonical-eq`
  - `node ttmp/2026/11/01/KILN-009-*/scripts/04-kernel-reads-of-mutated-input.mjs`
- The 162 graph used: `ttmp/2026/10/30/KILN-005--.../sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float16/6/samples/transformers-auto-model/jinaai_jina-reranker-m0/_decomposed/jinaai_jina-reranker-m0_start2_end15_1`.

### Technical details

- `SubgraphMatcher` settings used, as in PassBench and script 658: `match_output=False, match_placeholder=False, remove_overlapping_matches=True, ignore_literals=False`.
- The launcher passes `k.reads + [k.writes]` as kernel arguments in launch order on one stream (`runtime/python/kiln_launch.py:401-405`), so launch order is execution order.

## Step 4: Drafting the design guide

I wrote the design doc in four parts, assembled them under the frontmatter docmgr created, and then corrected the in-kernel proof once I found that the index algebra already provides a canonical key. The doc follows the writing-style order (summary, scope, orientation, current state, gaps, architecture and APIs, decision records, pseudocode, phases, tests, risks, references) and distinguishes existing behavior (Phase 0), the first slice (Phases 1-4) and deferred design (Section 11.3).

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Produce the intern guide with prose, bullets, pseudocode, mermaid diagrams, API sketches and file:line references.

**Inferred user intent:** A new engineer should be able to implement and validate the change from the doc alone.

**Commit (code):** none.

### What I did

- Wrote `design-doc/01-direct-writes-of-mutated-inputs-analysis-design-and-implementation-guide.md`: 12 sections, 8 decision records, 3 mermaid diagrams (pipeline, export flow, run-time sequence), and pseudocode for `planMutation`, `sameIndexSlots`, `retargetProducer` and the family 162 flow.
- Before citing them, verified line numbers with `grep -n` in `scripts/kiln-export.mjs` (`--mutation` at 55), `integrations/passnet/test_dispatch.py` (55, 60) and `packages/kiln/src/core/ix.js`.
- Checked the consumers of `reads`/`writes` (`runtime/python/kiln_launch.py:182-197`, `runtime/webgpu/launch.ts:16, 51-54, 90`), to make sure that a kernel writing an input buffer breaks no launcher assumption.

### Why

- An API sketch that names a nonexistent helper (`IX.equal`) would mislead the implementer. Replacing it with the real `IX.keyOf` and `IX.loadsOf` keeps the guide honest.

### What worked

- `ix.js` exports `keyOf` (126), `loadsOf` (29) and `LD` (27), and the affine normalizer sorts terms by key (60). The same-index proof can be written with existing functions.
- Neither launcher assumes that inputs are read-only. Both bind `reads + [writes]` by buffer id.

### What didn't work

- My first draft used an invented `IX.equal`. I replaced all five occurrences after reading `ix.js`; `grep -n "IX.equal"` now returns nothing.

### What I learned

- Buffer ids must stay dense because `kiln_launch.py:353` allocates `[None] * len(self.buffers)` and indexes by `b["id"]`. Removing the producer's old scratch buffer therefore requires renumbering (`compactBuffers`), not deletion alone.

### What was tricky to build

- Deciding how family 162's extra return reaches the dispatcher. `output_permutation` requires the rule's and the variant's returns to cover the same nodes. The fix must therefore append the kept in-place result on both the AST side (`drop_dead_statements`) and the FX side (`translate_graph`), in the same order. A `None` leaf would avoid exporting the value but would add a new manifest leaf kind. I chose the real output (Decision 7.7).

### What warrants a second pair of eyes

- Decision 7.3: dropping `__restrict__` on aliased parameters. The claim that same-index access is otherwise undefined behavior under `const __restrict__` should be checked by someone who knows NVCC's read-only path in detail.
- The claim in Section 8.2 that one store per kernel plus a race-free original kernel implies per-element exclusivity.

### What should be done in the future

- Bookkeeping and validation (Step 5).

### Code review instructions

- Read Sections 3, 4.6, 4.9 and 8 first, then the decision records.

### Technical details

- Measured scripts cited by the doc: `scripts/01-…` through `scripts/04-…` in this ticket.

## Step 5: Recovering from a scratchpad collision, then bookkeeping

The coordinator reported that my design doc contained another agent's material. The KILN-006 agent (tensor-core matrix products) had written drafts with the same bare file names (`body1.md` … `body3.md`) into the shared session scratchpad between my writes and my assembly step. My assembled doc therefore held KILN-006's Sections 4-7 ("Operand precision and the legality rule", "Tile IR: the `mma` mapping", the `mma.sync` decision records) at lines 157-460 in place of my Sections 4-5. I regenerated Sections 4-5, spliced them in, re-read the whole document, and then finished the docmgr bookkeeping.

### Prompt Context

**User prompt (verbatim):** see Step 1. Coordinator instruction for this step (not user-authored): delete the foreign tensor-core content, regenerate Sections 4-5, re-read the whole doc, keep drafts in `scratchpad/kiln009/` only, and record the incident here.

**Assistant interpretation:** Restore the doc to KILN-009 material only and prevent a recurrence.

**Inferred user intent:** Each ticket's deliverable must contain only its own analysis.

**Commit (code):** none.

### What I did

- Ran `grep -n "^## \|^### "` on the doc. It showed a foreign `## 4. Current-state analysis` at 157, `## 5. Gap analysis` at 185, then `## 6. Proposed architecture and APIs` twice (197 foreign, 461 mine), with `### 6.1 Operand precision and the legality rule` through `### Decision: Pessimistic tensor-throughput prior until measured` in between.
- Saved the corrupted file as `scratchpad/kiln009/design-doc.corrupted.md` for reference.
- Rewrote my Sections 4-5 (4.1-4.9 and the gap table) to `scratchpad/kiln009/sections-4-5.md`. A Python splice then replaced everything from the first `## 4. Current-state analysis` to the second `## 6. Proposed architecture and APIs`. The splice asserted that exactly two such headings existed.
- Re-read the full 679-line doc. Grepping for `mma`, `tensor-core`, `tf32Pass` and `Operand precision` now matches only the substrings in "summary" and "command".
- Related 7 files to the design doc, added the five phase tasks, updated `index.md`, added a changelog entry, and ran `docmgr doctor`.

### Why

- The coordinator's report matched the evidence: the scratchpad listing showed `body1.md` through `body4.md` with modification times 07:43-07:46, interleaved with my own writes.

### What worked

- Sections 1-3 and 6-12 of my doc were intact. Only my `body2.md` (Sections 4-5) had been replaced, and the foreign content had been inserted in its place.

### What didn't work

- **Scratchpad file collision.** I wrote draft parts to bare names in the shared scratchpad (`.../scratchpad/body1.md` … `body4.md`), which the session's other ticket agents share. The KILN-006 agent used the same names. My assembly step (`python3 … body{i}.md for i in 1..4`) therefore concatenated its `body2.md` (25080 bytes, 07:45) into my doc. Since then all my drafts live in `.../scratchpad/kiln009/`. My own `body1.md`-`body4.md` writes may in turn have overwritten KILN-006's drafts. That agent's doc should be checked for KILN-009 content ("planMutation", "write-back", "family 162").
- docmgr was slow while five agents ran it at once. Each `docmgr doc add`/`task add` took one to several minutes at about 100% CPU, and several calls outlived the 120 s tool timeout and finished in the background.

### What I learned

- Concurrent agents in one session share the scratchpad. Draft files need a per-ticket subdirectory.

### What was tricky to build

- Splicing without losing the IX corrections from Step 4. Those edits were in Sections 6-11, which the splice kept, because it cut only between the two section markers.

### What warrants a second pair of eyes

- The KILN-006 design doc, for the reverse contamination described above.

### What should be done in the future

- Implementation Phases 1-5 (tasks in `tasks.md`).

### Code review instructions

- `grep -n "^## " design-doc/01-*.md` must show sections 1-12, each exactly once.

### Technical details

- Recovery artifacts: `/tmp/claude-1000/-home-manuel-code-wesen-kiln-worktrees-passnet/cd5f3680-095d-4dc0-be9b-3833056c7f6a/scratchpad/kiln009/design-doc.corrupted.md` and `.../kiln009/sections-4-5.md`.

## Step 6: Implementation start: orientation, rules and baseline

This step opens the implementation phase of KILN-009 in its own worktree. I read the common rules file the coordinator wrote for all implementation agents, the design guide (all 678 lines), the earlier diary steps, the diary skill and its investigation-entry reference, and the code the guide names. Both test suites passed before any change, which fixes the baseline.

### Prompt Context

**User prompt (verbatim):** "then, can we work on them in parallel (in separate worktrees maybe?)"

**User prompt (verbatim):** "tell each agent to use their own diary and to folow the diary format as they go, and to write a full report for the go-go-parc vault once they are done ( write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). )"

**Coordinator instruction (not user-authored, summary):** implement KILN-009 (direct writes of mutated inputs, plus the two family-162 matcher blockers) in worktree `/home/manuel/code/wesen/kiln/worktrees/kiln-009-mutated-inputs`, branch `impl/kiln-009-mutated-inputs`; CPU only, no GPU host; KILN-005 scripts 674 and 658 may run locally; never modify KILN-005 frozen evidence; do not implement fixes owned by KILN-008/010/011.

**Assistant interpretation:** Build Phases 1-4 of the guide on CPU, validate each with tests and corpus-scale CPU evidence, keep this diary current, and hand the GPU validations to the coordinator as a list.

**Inferred user intent:** Several tickets progress at once without stepping on each other, and each leaves a reviewable trail and a vault report.

**Commit (code):** none in this step.

### What I did

- `git rev-parse --show-toplevel` → the KILN-009 worktree; `git branch --show-current` → `impl/kiln-009-mutated-inputs`; base commit `373766b`.
- Read `packages/kiln/src/std/export.js`, `emit.js` (toCuda, toSim, SimMetrics), `program.js`, `core/ix.js`, `test/export.mjs`, `scripts/kiln-export.mjs`, `integrations/passnet/{corpus,generate_pass,fx_normalize}.py`, KILN-005 scripts 658 and 674.
- Baseline: `cd packages/kiln && npm test` → `all 48 passed`, exit 0; `cd integrations/passnet && python3 -m pytest -q` → `177 passed, 7 subtests passed`, exit 0.

### Why

- The guide fixes the plan; reading the emitters and the simulator first showed where a new option and a new file could carry the change without rewriting code that the KILN-008/010/011 agents edit concurrently.

### What worked

- The guide's file:line references matched the tree.

### What didn't work

- No failures in this step.

### What I learned

- Exported kernel records carry no Loop IR (`K`), so any CPU oracle over an exported program needs the IR from the export process itself.
- The worktree's `node_modules/@kiln/kiln` links to its own `packages/kiln`, so `apps/workbench/src/compile.js` and the relative imports in `scripts/kiln-export.mjs` load one module instance.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- N/A.

### What should be done in the future

- Phases 1-4 (Steps 7-9).

### Code review instructions

- N/A for this step.

### Technical details

- Scratch directory: `/tmp/claude-1000/-home-manuel-code-wesen-kiln-worktrees-passnet/cd5f3680-095d-4dc0-be9b-3833056c7f6a/scratchpad/KILN-009-impl/`.

## Step 7: First slice: launch-order and same-index proofs, the rewrite, the program oracle

I implemented Phases 1-3 of the guide as one slice, because the report-only mode of Phase 1 is the same analysis with the rewrite switched off: `mutationStrategy: "writeback"` keeps the old program and records what `auto` would have done. The four measured cases of guide Section 4.6 came out exactly as the guide predicted (three direct, the fused mean-subtract refused), and a first corpus table over the 16 input-mutation tasks found 89 of 114 mutations direct.

### Prompt Context

**User prompt (verbatim):** see Step 6.

**Assistant interpretation:** Implement `planMutation`, `sameIndexSlots`, `retargetProducer`, `compactBuffers`, `toCuda(K, { alias })`, the strategy option and the CPU program oracle, with tests.

**Inferred user intent:** Remove one launch, one copy and one scratch buffer per mutation wherever this is provably safe, and make every decision visible in the artifact.

**Commit (code):** `15d3344` — "KILN-009: direct writes of mutated inputs"

### What I did

- New `packages/kiln/src/std/inplace.js`: `sameIndexSlots(K, slots)`, `planMutation({kernels, irs, inputs, outputs, buffers}, {outName, inName})`, `retargetProducer(...)`, `compactBuffers(program)`, `MUTATION_STRATEGIES`.
- `emit.js`: `toCuda(K, { alias = [] } = {})`. Aliased sources are declared `T* srcN` (no `const`, no `__restrict__`), and `dst` drops `__restrict__` when any source aliases it. With `alias = []` the output is byte-identical (tested over 12 kernels, including the attention chain).
- `emit.js` toSim (instrumented only): `M.gmem(A, "ld", <slot>)` and `M.gmem(A, "st", "out")`, so a metrics object can tell which parameter a warp access touched. `SimMetrics.gmem` ignores the new argument.
- `export.js`: an `irs` array parallel to `kernels`; the mutation loop calls `planMutation`, then `retargetProducer` or the existing `writebackKernel`; `program.mutations[]` records `{output, input, strategy, producer|reason, slots, planned}`; the result goes through `compactBuffers`. `loopIrOf(record)` (a module WeakMap) exposes each record's Loop IR to in-process consumers; a write-back maps to `{ copy: true }`.
- New `packages/kiln/src/std/program-sim.js`: `simulateProgram(program, inputs, { instrument })` runs the exported kernels in launch order over one buffer table, so a kernel bound to the same buffer twice really shares it. `AliasWatch` (a `SimMetrics` subclass) records per-thread loads from aliased slots and stores, and reports a cross-thread read of a stored element or a read after the thread's own store.
- `scripts/kiln-export.mjs --mutation-strategy auto|writeback`; `corpus.py compile --mutation-strategy` passes it through when a record has mutations.
- New test `packages/kiln/test/inplace.mjs`; `test/export.mjs`'s write-back case now checks both strategies.
- `scripts/05-mutation-plan-table.py` (this ticket): export and compile tasks with script 674's settings and tabulate `program.mutations[]`.

### Why

- A separate `inplace.js` and `program-sim.js` keep the change out of `kernel.js`, `tile.js` and `loop.js`, which other tickets edit. The two edits to `emit.js` are one signature line and two instrumentation arguments.
- `program.mutations[]` makes every refusal reviewable from the JSON alone (guide Section 6.2).

### What worked

- Script 04 after the change: `relu_ then mean` → `k___mut0 reads [*0] writes *0`, no write-back; `x += y` cases → producer `reads [*0,1] writes *0`, consumer re-pointed to buffer 0; `x - mean(x)` → write-back kept.
- The oracle matched `g.eval` for both strategies on every case, and the hazard watcher flagged a deliberately forced in-place mean-subtract (`thread 1 reads element 0, which thread 0 stores`), which is the intra-block race guide Section 4.7 says lockstep simulation hides.
- Two mutations in one program (`relu_` of x and of y) both went direct, and the oracle agreed.
- First corpus table (`sources/mutation-plan-table-first-slice.json`): 89 direct, 25 write-back. Reasons: `the store is inside a loop` (22), `a load from slot 0 is in a different loop or branch than the store` (3).

### What didn't work

- `node test/export.mjs` → `FAIL a final write-back kernel stores into the input`: the old test assumed the write-back always exists. Rewrote it to check `inPlace` under `auto` and the copy kernel under `writeback`.
- `node test/inplace.mjs` → `FAIL x <- x - mean(x): writeback (producer 0: a load from slot 0 is in a different loop or branch than the store)`: my expected reason was "reads index"; the reduction's load sits in a `for`, so the branch check fires first. Adjusted the expectation (later reordered, Step 8).

### What I learned

- The guide's same-index rule is exact for the 1024-thread elementwise kernels of the unit tests, but most corpus producers are coarsened (`TPB=64,COARSEN=4`: a `for j` loop of 4 elements per thread) or row kernels (`MAP=row`), which the first-slice rule refuses.

### What was tricky to build

- Structural index equality is not enough on its own: `iset e = ...; load x[e]; iset e = e + 1; store dst[e]` has equal keys and different addresses. The rule therefore also refuses any statement between the load and the store that assigns a variable of the store's index.

### What warrants a second pair of eyes

- `toCuda`'s alias spelling: aliased sources lose `const` as well as `__restrict__` (Decision 7.3). NVRTC has not compiled it yet (GPU).
- `compactBuffers` renumbers buffer ids; launchers index pointers by id.

### What should be done in the future

- Extend the proof to coarsened and row kernels (Step 8).

### Code review instructions

- Start at `packages/kiln/src/std/inplace.js` (`planMutation`, then `sameIndexSlots`), then the mutation loop in `export.js`, then `program-sim.js`.
- `cd packages/kiln && node test/inplace.mjs && node test/export.mjs`.

### Technical details

- In-place identity: `hash(identity + "|inplace:" + slots.join(","))`; record field `inPlace: { input, slots, of: <original identity> }`; `wgsl: null`, `wgslUnavailable: "in-place input write is emitted for CUDA only"`.

## Step 8: Coarsened and row kernels: enumerated store addresses and the barrier rule

The first-slice refusals were dominated by two kernel shapes, so I extended `sameIndexSlots` with a proof that covers both without guessing. The new rule enumerates every address the producer's single store writes over the whole launch and requires them distinct and in range; a second clause admits row kernels in which every thread of a block reads the block's element, a `__syncthreads()` follows, and one thread stores it. The corpus went to 113 of 114 mutations direct, and the program oracle found no hazard and no difference between the strategies on the 84 programs it could run.

### Prompt Context

**User prompt (verbatim):** see Step 6.

**Assistant interpretation:** Widen the proof to the producers the corpus actually has, and only as far as a sound argument allows.

**Inferred user intent:** The optimization should apply to real PassBench graphs, not only to toy kernels.

**Commit (code):** `78f5f1b` — "KILN-009: coarsened/row in-place proofs, family 162 matcher fixes, CPU evidence"

### What I did

- Inspected a refused producer, task 49 `000.kiln.js`: `for (int j = 0; j < 4; j += 1) { e = 256*bid + 64*j + tid; if (e < 2457600) { in0 = src0[f(e)]; ...; dst[f(e)] = v0; } }`.
- Inspected the branch refusals, task 111 `007` and task 57 `002`: `in0 = src0[g(bid)]` at top level, a reduction loop, a shared-memory tree with `__syncthreads()`, then `if (tid == 0) dst[g(bid)] = ...`.
- `storeInjective(K, frames, { limit })` in `inplace.js`: generates a JavaScript function that walks bid × tid and the loops and branches on the path to the store, evaluates the path's `iset`s and conditions with `IX.emit(e, "js")`, and marks each address in a `Uint8Array`. It returns the first duplicate or out-of-range address, or gives up past `ENUMERATION_LIMIT = 2^26` (thread, iteration) pairs. Statements beside the path that assign a variable the path reads are refused.
- `sameIndexSlots` now: one store; no gather through an aliased slot; for each aliased load, equal `IX.keyOf`, then either (same list) before the store with no reassignment between, or (barrier) at top level, index depending on `bid` only, a top-level `sync` between it and the branch holding the store, the branch made of `if`s only; and finally `storeInjective`.
- `AliasWatch` in `program-sim.js` now counts barrier epochs per block (`sync` override), and accepts a cross-thread read when it is in the same block and in an earlier epoch than the store.
- Tests added: barrier ok / no barrier / every thread storing; coarsened distinct / loop storing one element per iteration / limit / out of range; and three end-to-end oracle cases: `x += a @ w` (row kernel, rtx5090), `x += sum(a*w)` (staged row kernel), `relu_` on `[24,256,20,20]` with a100 (`TPB=64,COARSEN=4`).
- `scripts/06-oracle-over-corpus.mjs`: compiles each corpus graph in process (a100, contraction separate, FP32 products), exports both strategies, runs both on the oracle (auto instrumented), and requires no hazard and bitwise-equal outputs and final inputs.

### Why

- Distinct store addresses plus same-index loads imply that an element is read only by the (block, thread, iteration) that stores it, before it stores it. Enumeration proves distinctness exactly for constant launch geometry; the original kernel's race freedom is no longer assumed.
- The barrier clause is the guide's deferred "row-level proof" (Section 11.3) in the narrowest form the corpus needs.

### What worked

- `sources/mutation-plan-table.json`: 113 direct, 1 write-back (task 57 `000`: `more than 67108864 (thread, iteration) pairs to enumerate`). Every task compiled (internal reference check ON).
- `sources/mutation-oracle.json`: 114 programs; 84 ok, 0 hazard, 0 differs, 20 skipped (over the 2^24-thread simulation budget), 10 errors.
- `node test/inplace.mjs`: 80 checks ok; the coarsened a100 case runs in about 2.6 s.

### What didn't work

- `node test/inplace.mjs` → `TypeError: Cannot read properties of undefined (reading 'find')` at `storeInjective`: the hand-written Loop IR in the tests had no `params`/`grid`/`block`. Gave the helper a minimal kernel shape.
- `node test/inplace.mjs` → `SyntaxError: missing ) after argument list` at line 118: a malformed check I wrote; replaced it.
- The probe `x += a @ w` was refused with `a for before the store assigns index variables`: the reduction loop's counter `r0` tripped the first, too coarse refusal. Narrowed it to variables the path reads.
- The oracle then failed the row cases: `thread 1 reads element 0, which thread 0 stores`. The watcher did not model barriers; added epochs.
- The 10 oracle errors are all task 45 (`F_v1 is not defined`): its producer has a `bool` typed value (`bool v1 = 0`), which `toSim` does not declare. Typed and integer values in the simulator belong to KILN-010, so I left it.

### What I learned

- Every corpus producer is one of three shapes: thread-mapped, coarsened thread-mapped, or a row reduction with a one-thread store.

### What was tricky to build

- The barrier clause needs three facts at once: every thread of the block reads before a block-wide barrier (top level, so uniform), the store follows the barrier, and no other block stores that element (enumeration over bid). Missing any one admits a race; the unit tests cover each omission.

### What warrants a second pair of eyes

- `storeInjective` evaluates indices with JavaScript `%`/floor `/`, which match CUDA only for nonnegative operands. It refuses negative addresses, but a negative intermediate that becomes a valid address would be evaluated differently from CUDA. Loop IR coordinates are nonnegative by construction.
- The barrier clause relies on the top-level `sync` being executed by every thread (it is in `K.body`, outside any branch).

### What should be done in the future

- Integer/bool support in `toSim` (KILN-010) would let the oracle run task 45.
- A sampled-block oracle mode would cover the 20 programs over budget.

### Code review instructions

- `packages/kiln/src/std/inplace.js` `storeInjective` and the barrier branch of `sameIndexSlots`; `program-sim.js` `AliasWatch.sync`.
- `node ttmp/.../scripts/06-oracle-over-corpus.mjs --output /tmp/x.json <task dirs from script 05>`.

### Technical details

- Plan table totals: first slice `{'direct': 89, 'writeback': 25}`, extended `{'direct': 113, 'writeback': 1}`; task 147 and 162 have no input mutations.

## Step 9: Family 162: kept in-place results and the `__eq__` spelling

I implemented both matcher fixes of guide Section 4.9. The pattern now returns kept in-place results that nothing reads, the compiled program returns the same nodes, and target graphs spell `x.__eq__(0)` as `operator.eq`, like the symbolically traced pattern. A census scan showed the AST and FX sides agree on all 1984 graphs where both sides parse, and the generated family-162 rule now selects its own specialization exactly once in all six graphs on meta tensors.

### Prompt Context

**User prompt (verbatim):** see Step 6.

**Assistant interpretation:** Phase 4: `drop_dead_statements`, `expose_inplace_results`, `canonicalize_spellings`, tests, script 658.

**Inferred user intent:** Unblock family 162, which PassBench never evaluated.

**Commit (code):** `78f5f1b` (same commit as Step 8).

### What I did

- `generate_pass.drop_dead_statements` returns the names bound by kept in-place statements whose results are unused, in statement order, and refuses a name that a later kept statement rebinds. `extract_pattern` appends them to the return tuple and clears `singleton`.
- `corpus.inplace_node(node)` (the in-place rule, shared now by `eliminate_dead_code`) and `corpus.expose_inplace_results(graph)`, called in `translate_graph` right after dead-code elimination.
- `fx_normalize.DUNDER_ALIASES` for `__eq__ __ne__ __lt__ __le__ __gt__ __ge__`, applied in `canonicalize_spellings` to two-argument `call_method` nodes.
- Tests in `test_pass_generation.py`: a reduced 162 source (no device literal) whose pattern returns `(tmp_5, tmp_4)`, constructs a `SubgraphMatcher`, and matches a TorchDynamo capture exactly once after normalization; its program output structure has two leaves; a rebound unused result is refused.
- `scripts/07-census-inplace-agreement.py`: AST vs FX agreement over all 2060 graphs of the 200 eval samples, plus the list of graphs that call a comparison dunder; writes a 658 plan of the affected samples.
- Ran KILN-005 script 658 (unchanged, from this worktree) on that plan, then `scripts/08-match-generated-rules-meta-device.py` on its 162 output.

### Why

- Returning a real output (Decision 7.7) keeps the rule and the program describing the same computation; `output_permutation` stays the identity.

### What worked

- `sources/census-inplace-agreement.json`: 2060 graphs, 1984 on both sides, 1984 agree; 10 graphs with unused in-place results (families 124 and 162, all `masked_fill_`); 17 with a comparison dunder; affected samples 13, 124, 162, 170.
- Script 658 (`sources/phase4-658-simulation.json`): 162 now generates (`6 variants; 1 source-derived patterns`), output structures `{'tuple': [out0, out1, out2]}`, permutation `[0, 1, 2]`; capture fails on CPU (`Found no NVIDIA driver`) because the graphs call `.to(device('cuda'))`.
- Script 08 (`sources/family162-meta-match.json`): `6/6 identity ok`, returning nodes `['tmp_13', 'tmp_7', 'tmp_4']`.
- 162 compiles (`end-to-end check ok at loop`, 6/6) with three outputs.

### What didn't work

- Script 07's first run: `AttributeError: 'BinOp' object has no attribute 'func'` on 1016 graphs: my recorder classified every kept statement, not only the unused in-place ones. Fixed the filter; the rerun has no such errors.
- Script 08's first run: `ModuleNotFoundError: No module named 'corpus'`: `parents[5]` is `ttmp/`, not the repository root. Fixed to `parents[6]`.
- Samples 13 and 170 cannot be generated on CPU (`Found no NVIDIA driver`, during export), and 124 fails import with `TypeError Unsupported FX value: float: inf` (an existing importer limitation). Their rule selection after the `__eq__` change is a GPU-host check.
- 6 graphs of sample 67 raise `NameError: name 'tmp_3' is not defined` in `extract_pattern`; the base worktree (`passnet`, `373766b`) raises the same, so it predates this change.

### What I learned

- The in-place-result fix also applies to family 124 (`masked_fill_`, 4 graphs), which 658 could not reach on CPU.

### What was tricky to build

- The AST rule and the FX rule must pick the same statements in the same order, or `output_permutation` raises `Rule and variant return different values`. Both now derive from one keep condition, and the census scan checks agreement by operation name and order.

### What warrants a second pair of eyes

- The dunder canonicalization can create matches that did not exist before (Decision 7.8). On CPU only 162 could be checked; 13, 124 and 170 need the CUDA host.

### What should be done in the future

- Rerun script 658 for samples 13, 124, 162 and 170 on the CUDA host.

### Code review instructions

- `integrations/passnet/generate_pass.py` `drop_dead_statements`/`extract_pattern`; `corpus.py` `expose_inplace_results`; `fx_normalize.py` `DUNDER_ALIASES`.
- `cd integrations/passnet && python3 -m pytest -q test_pass_generation.py`.

### Technical details

- Validation at commit `78f5f1b`: `npm test` → `all 49 passed`; `pytest -q` → `180 passed, 7 subtests passed`.
