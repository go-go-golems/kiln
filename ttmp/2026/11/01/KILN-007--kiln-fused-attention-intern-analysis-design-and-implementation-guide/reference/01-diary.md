---
Title: Diary
Ticket: KILN-007
Status: active
Topics:
    - kiln
    - compiler
    - gpu
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological investigation diary for the KILN-007 fused-attention research and guide."
LastUpdated: 2026-11-01T07:31:56.136705731-05:00
WhatFor: "Record how the fused-attention design guide was researched, what evidence it rests on, and what remains open."
WhenToUse: "Read before resuming KILN-007 work or reviewing the design doc."
---

# Diary

## Goal

This diary records the research behind the KILN-007 design doc
(`design-doc/01-fused-attention-analysis-design-and-implementation-guide.md`), in the diary skill's
investigation format, written step by step while the work happens.

## Step 1: Orientation: skills, ticket state and the current SDPA lowering

This step loaded the workflow skills the task names, inspected the freshly created KILN-007 ticket
workspace, and read the code that defines what "attention" means in Kiln today. The outcome is a
confirmed picture of the existing lowering: attention exists only as a composition in the PassNet
FX importer, and it reaches the compiler as two ordinary matrix products around an ordinary softmax.

### Prompt Context

**User prompt (verbatim):** "Create new docmgr tickets for tensor-core matrix products  and fused attention and cumsum and writing mutated inputs (one docmgr + design doc per task). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Earlier user question (verbatim):** "and can we build them with CPU only"

**Assistant interpretation:** Write the KILN-007 (fused attention) design doc and diary inside the
existing ticket, evidence-backed with file:line citations, and answer the CPU-only question for this
feature explicitly. The parent agent owns ticket creation and the reMarkable upload.

**Inferred user intent:** An intern should be able to pick up fused attention as an implementation
project from this guide alone, and know which parts can be built and validated on a CPU-only machine.

**Commit (code):** none; documentation only, uncommitted by instruction.

### What I did

- Read `ticket-research-docmgr-remarkable` (SKILL.md, writing-style.md, deliverable-checklist.md),
  `textbook-authoring`, `docmgr` and `diary` (SKILL.md, investigation-entry.md).
- Listed the ticket directory: only the docmgr skeleton (index.md, tasks.md, changelog.md, README.md).
- `docmgr doc add --ticket KILN-007 --doc-type reference --title "Diary"` created this file.
- Started `docmgr doc add --ticket KILN-007 --doc-type design-doc --title "Fused attention: ..."`.
- Read with `nl -ba`: `integrations/passnet/fx_compose.py` (lower_sdpa at lines 126-149),
  `integrations/passnet/test_fx_compose.py` (test_attention_with_masks at 53-61),
  `integrations/passnet/kiln_eval.mjs`, `packages/kiln/src/std/emmy.js`, `matmul.js`, `targets.js`,
  `fns.js`; grepped `tensor.js` for softmax, matmul, precision and the decomposition rules.

### Why

- The writing-style guide fixes the design-doc section order and decision-record format, so it had
  to be read before drafting. The diary format is mandatory for Kiln work (user memory).
- The SDPA lowering is the existing behavior the design must replace; every later claim depends on it.

### What worked

- `lower_sdpa` confirms the task brief: it emits
  `N.cast(N.matmul(N.softmax(scores, -1), v, "highest"), dtype)` with
  `scores = N.mul(N.matmul(q, N.transpose(k, -2, -1), "highest"), scale)`, a bool mask as
  `N.select(mask, scores, -Infinity)` and a floating mask as `N.add(scores, N.cast(mask, "f32"))`
  (fx_compose.py:139-149). Dropout, is_causal and enable_gqa raise ValueError (132-134).
- `nn.softmax` decomposes in `tensor.js` (decompose rule at line 547); its reference is
  `softmaxRef` = exp(x - max) / sum (tensor.js:135).
- `nn.matmul` requires FP32 operands (tensor.js:337-340) and decomposes through
  `lowerMatmul` into `T.sum(T.mul(left, right), -2)` over a `[...batch, M, K, N]` work view
  (matmul.js:49-55). There is no matmul-specific node below the tensor level.
- `REDUCERS` (fns.js:93-104) holds only scalar monoids (add, max, min, mul and typed integer
  variants); there is no tuple-valued reducer, which matters for online softmax.
- `smemPerBlock` is 48 KiB on every target, including gb10 (targets.js:3-4, 16), because the CUDA
  emitter declares shared memory statically.

### What didn't work

- The design-doc `docmgr doc add` exceeded the 120 s foreground timeout and was moved to the
  background ("Command did not complete within its 120s timeout and was moved to the background").
  The diary `doc add` immediately before it succeeded. Likely cause: sibling agents running docmgr
  on KILN-006/008/009 at the same time. Recovery: wait for the background job, then verify the file.

### What I learned

- Attention is not an operation anywhere in Kiln's dialects; it is a Python-side composition. A
  fused kernel therefore needs either a new nn op or recognition of the composed subgraph.
- `kiln_eval.mjs` compiles with `contraction: "separate"` and `matmulPrecision: "highest"` on an
  a100 target (line 22), so the CPU numeric test exercises the frontend reference and the Loop IR
  evaluator only, not the tile/kernel/gpu levels.

### What was tricky to build

- Nothing built yet. The subtle point is the coordinator's mid-task instruction (Step 2) that
  changed the diary from end-of-task to as-you-go.

### What warrants a second pair of eyes

- Whether a bool mask that masks a whole row produces NaN in Kiln the same way it does in PyTorch:
  softmax over all -Infinity is exp(-inf - -inf) = NaN. The test sets `keep[..., 0] = True`
  (test_fx_compose.py:60) precisely to avoid that case.

### What should be done in the future

- Read loop.js, tile.js, kernel.js and emit.js for the fusion and kernel-template facts (Step 2).

### Code review instructions

- Start at `integrations/passnet/fx_compose.py:126` and `packages/kiln/src/std/tensor.js:547`.
- Run `cd integrations/passnet && python -m unittest test_fx_compose.ComposeNumericTests.test_attention_with_masks`.

### Technical details

- Pipeline (emmy.js:2): `torch (nn) -d-> tensor -o,l,f,s-> loop -t-> tile -k-> kernel -c-> gpu`.
- Pass order (emmy.js:21-38): optional tf32Pass, decomposition, optional separateRoundingPass,
  optimization, lift, fuse, stamp, tilePass, kernelPass, emitPass.

## Step 2: Reading the lower IRs and measuring today's attention kernels on CPU

This step read the Loop, Tile and Kernel levels to learn how the composed attention is scheduled,
then wrote a CPU-only experiment script that compiles a BERT-shaped attention and prints the kernels
each level produces. The outcome is direct evidence that today's lowering always yields three kernels
and materializes the L×S matrix in global memory, and that the fusion partition shifts with shape.

### Prompt Context

**User prompt (verbatim):** "tell each agent to use their own diary and to folow the diary format as they go"
(relayed mid-task by the coordinator; the original task prompt is in Step 1).

**Assistant interpretation:** Keep this ticket's own diary and write each step as the work happens,
in investigation format, instead of one summary at the end.

**Inferred user intent:** The diary should be a faithful chronological record, so a reviewer can see
where each conclusion in the design doc came from.

**Commit (code):** none.

### What I did

- Read `packages/kiln/src/std/loop.js` in full with `nl -ba` (E constructors 50-64, `schedule` 96-159,
  `workOf` 190-202, `compileSerial` 213-239, lift rules 292-317, `FusionIllegal`/`inlineInto` 321-354,
  `createFusionRule` and its work guard 357-411).
- Read `packages/kiln/src/std/tile.js` in full (knobs 15-24, `analyze` 31-99, `forkTree` 107-130,
  `launch` 133-144, `timeModel` 154-197, `estimate` 205-285, `costPrior`/`predictedCost` 361-375).
- Read `packages/kiln/src/std/kernel.js` KB builder (20-38), `treeCombine` (106-120), `matRow` (121-174),
  `materialize` (305-327); grepped `emit.js` for `toCuda` (28), `__shared__` (66), `toSim` (174).
- Read the W-10 attention preset (`apps/workbench/presets/W-10-attention.js` and `.md`) and the
  online-softmax section of `W-06-softmax.md` (lines 28-40).
- Wrote `scripts/01-dump-attention-kernels.mjs` and ran it at three shapes:
  `node .../scripts/01-dump-attention-kernels.mjs` (B=2 H=12 L=S=128 D=64),
  `... 1 16 1024 1024 64`, and `NEST=1 ... 1 1 4 6 8` (prints the Loop IR nests).

### Why

- The design must say exactly where the L×S matrix is materialized and why fusion does not remove it;
  that needs the scheduler and the fusion guard, not just the frontend.
- The experiment runs on CPU only, which also demonstrates part of the answer to "can we build them
  with CPU only": the whole compiler down to the analytic cost model runs in Node.

### What worked

- BERT-base shape (B=2 H=12 L=S=128 D=64) on gb10: 3 kernels.
  `k_matmul_reduce` [2,12,128,1,128] MAP=tiled BM=128 BN=32 BK=16 TN=4, 14.5 us, dram 3.00 MB;
  `k_matmul_ew_softmax_reduce` [2,12,128,128] MAP=row TPB=256, 15.1 us, 3.13 MB;
  `k_matmul_reduce_2` [2,12,128,64] MAP=tiled, 14.5 us, 3.00 MB; predictedCost 44.1 us.
- L=S=1024, H=16, B=1: 298.7 + 537.9 + 330.3 = 1166.8 us predicted, the softmax kernel moving
  132 MB of DRAM traffic. The score matrix is 16·1024·1024·4 B = 64 MiB.
- At the toy shape (L=4 S=6 D=8) the partition differs: kernel 2 writes exp(s - max) and kernel 3
  (`k_softmax_matmul_reduce`) recomputes the row sum and divides inside the P·V reduction
  (`v0 = div(in0, acc0)` within `for r1`). Either way the L×S tensor goes through global memory.

### What didn't work

- First run failed: `TypeError: Cannot read properties of undefined (reading 'shape')` at
  `n.args.map((a) => "[" + a.type.shape + "]")`. Graph nodes in a checkpoint do not expose argument
  Values with `.type`. Fix: print the reduction count from `schedule(...)` instead, and the Loop IR
  nest via `printNest` when `NEST=1`.

### What I learned

- Loop IR reductions are scalar: `E.red(fn, r, n, body)` with `fn` a key of `REDUCERS`. An online
  softmax needs three coupled accumulators (m, l, acc[d]); none of them can be expressed as one
  `E.red` over the existing monoids, because each update reads the others.
- Inlining the scores kernel into P·V would place the QK^T inner product inside the P·V reduction,
  recomputed once per output column d; the `merge_loop_ops` guard (`now <= was * 1.02`, loop.js:402)
  rejects that because work grows by roughly a factor of D. W-10-attention.md states the same:
  fusion across a contraction "the blowup guard currently declines".
- `analyze` admits MAP=tiled only for a single innermost reduction with no nested reduction
  (tile.js:76-95), so a fused attention body can never be tiled by the generic path.
- The fusion partition is chosen by work estimates and shifts with shape; tests must not hard-code
  a kernel split for the composed path.

### What was tricky to build

- The experiment's relative imports run six directories up from the ticket's `scripts/` directory to
  the worktree root; running from the root with `node <path>` keeps them stable.

### What warrants a second pair of eyes

- The cost model has no model of a kernel that keeps the scores on-chip; any fused-attention cost
  must be added deliberately or the decider will rank it with a wrong formula.

### What should be done in the future

- Read the GPU evidence (probe 675, composed-ops replay, tf32 requal) and the KILN-005 diary steps
  before writing the dtype/rounding section (Step 3).

### Code review instructions

- Re-run: `node ttmp/2026/11/01/KILN-007--kiln-fused-attention-intern-analysis-design-and-implementation-guide/scripts/01-dump-attention-kernels.mjs [B H L S D]`.

### Technical details

- The script compiles with `contraction: "separate"`, `matmulPrecision: "highest"`, target `SPECS.gb10`,
  the same options `integrations/passnet/kiln_eval.mjs:22` uses except the target.

## Step 3: GPU evidence, the CPU-only toolchain, and an online-softmax reference experiment

This step collected the measured GPU facts the design depends on (probe 675 and the two replay audits
that cover family 5), checked which validation tools exist on a CPU-only host, and wrote a second
experiment: a scalar JS flash-style attention compared with the three-pass composition. The outcome
is a quantified rounding budget for the online form and for rounding P to f16/bf16, plus a concrete
answer to the CPU-only question.

### Prompt Context

**User prompt (verbatim):** see Step 1 (and the as-you-go diary instruction in Step 2).

**Assistant interpretation:** Ground the dtype and rounding claims in recorded measurements, and
separate measured facts from inferences.

**Inferred user intent:** The intern must know which numeric behavior is proven and which still
needs a GPU probe.

**Commit (code):** none.

### What I did

- Read `KILN-005/sources/gpu-probes-v2/result.json` (`attention_f32`) and
  `KILN-005/scripts/675-attention-and-low-precision-probes.py` (lines 1-60).
- Summarized family 5 (record `index: 5`) in `composed-ops-replay-gpu-v1/results-audit.json` and
  `tf32-rne-requal-gpu-v1/results-audit.json` with a short python one-liner over `records[].graphs[]`,
  grouping by dtype directory and `nominal_accepted`, and printed each graph's `correct_at`.
- Read commit bodies `6634f0c`, `fe45148`, `67678fd` and diary Step 260 in
  `KILN-005/reference/24-implementation-diary-volume-2-...md` (lines 5076-5150).
- Looked for CUDA tooling: `which ptxas nvcc nvidia-smi` (none), and found
  `~/.pyenv/versions/3.13.2/lib/python3.13/site-packages/nvidia/cu13/lib/libnvrtc.so.13`.
  Read the header of `apps/workbench/test/cuda_check.py` ("Works without a GPU").
- Wrote `scripts/02-online-softmax-reference.mjs` and ran it with defaults (L=64 S=200 D=64 BC=32,
  5 trials) and with `128 512 64 64 3`.
- Re-verified every line number I intend to cite with `grep -n`, because an earlier multi-file
  `nl -ba` call continued its numbering across files.

### Why

- The f32 rounding claim (pure FP32) is measured; the f16/bf16 claim (P rounded to the input dtype)
  came with the task brief. The design must label which is which.
- The online-softmax reorders the reduction; its error against the composed path decides the test
  tolerance for the fused kernel.

### What worked

- Probe 675 (GB10, torch 2.12.0a0 nv26.05, flags allow_tf32 true, precision "high"): the default
  f32 SDPA equals the `efficient` backend bit for bit (`equals_default: true`), and is closest to
  the FP32 reference (max abs 1.16e-6) rather than RNE TF32 (7.4e-4). `flash` and `cudnn` report
  "No available kernel" for f32; `math` is closest to RNE TF32.
- Family 5, composed-ops replay (TF32 products): 8/23 graphs accepted (f32 3/7, f16 4/8, bf16 1/8),
  score 0.132. tf32-rne-requal replay (FP32-pinned products): 15/23 (f32 7/7, f16 7/8, bf16 1/8),
  score 0.167 (`score.id: 6`). Every rejected graph executes and fails only the strictest point
  of the tolerance curve: `correct_at {"-5": false, "-4": true, "-3": true, "1": true}`.
- Experiment 2: online softmax vs three-pass, all FP32 registers: max abs 8.9e-7 (default shape) and
  3.1e-6 (S=512). Rounding P to f16 before P·V: 8.6e-5 / 5.7e-5; to bf16: 8.8e-4 / 4.8e-4.
  A fully masked row gives NaN in both forms (0/0 after exp(-inf)).

### What didn't work

- Two line citations in Step 1 were wrong (`matmul.js:90-96`, `fns.js:217-228`) because of the
  continued `nl` numbering; corrected in place to `matmul.js:49-55` and `fns.js:93-104`.
- No diary, commit or reference in KILN-005 records the "P rounded to the input dtype" explanation
  for the f16/bf16 misses; `grep -rn "probabilit\|memory-efficient"` finds nothing relevant. It stays
  an unprobed hypothesis in the design doc.

### What I learned

- The f16/bf16 misses are small (they pass at the 1e-4 point). The bf16 P-rounding effect measured
  on CPU (about 5e-4 to 9e-4 absolute) is of the size that separates those two points, which is
  consistent with the hypothesis but does not prove it.
- NVRTC is present on this CPU-only host through the pip `nvidia/cu13` wheel, so CUDA C++ to PTX
  compilation can run here; `ptxas` (register counts, spills) and any timing cannot.

### What was tricky to build

- The P-rounding variant must keep the row sum `l` from the unrounded p (as the experiment does) or
  it measures a different kernel; which one PyTorch's kernels do is part of the open probe.

### What warrants a second pair of eyes

- PyTorch's behavior on a fully masked row differs between backends and versions; Kiln currently
  produces NaN through the composed path. The design treats this as a probe item, not a fact.

### What should be done in the future

- Write probe 676 (f16/bf16 SDPA backend selection, P rounding, scale placement, fully masked rows)
  as Phase 0 of the design; run it on the GB10 host.

### Code review instructions

- `node ttmp/2026/11/01/KILN-007--kiln-fused-attention-intern-analysis-design-and-implementation-guide/scripts/02-online-softmax-reference.mjs [L S D BC trials]`.

### Technical details

- Online update per key tile: `m' = max(m, max_j s_j)`, `alpha = exp(m - m')`, `l = alpha*l + sum_j exp(s_j - m')`,
  `acc_d = alpha*acc_d + sum_j exp(s_j - m') * v_jd`, output `acc_d / l`.

## Step 4: Forced fusion shows attention is already one Loop IR expression

Before choosing between "a tuple-valued online-softmax reducer" and "a dedicated kernel template",
I tested a third possibility: that the three-pass softmax-contraction is already expressible as a
single Loop IR expression, and only the fusion work guard and the lack of a suitable Tile mapping keep
it in three kernels. Replacing the fusion pass with an unguarded one confirmed this. The outcome
changed the proposed architecture: the Loop IR needs no new reducer, and the work is a fusion rule,
an expression recognizer, a new Tile mapping and a new Kernel IR materializer.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Pick the representation of fused attention with evidence rather than
by preference.

**Inferred user intent:** The intern's first slice should reuse as much of the existing reference,
identity and simulator machinery as possible.

**Commit (code):** none.

### What I did

- Read `packages/kiln/src/std/program.js:1-135`: `gpu.kernel` identity (line 19), `programOf`
  (29-43), `referenceAt` (58-61, the simulator's reference is `compilePoint(schedule(kern.expr))`),
  `simulateKernel` (83-111). Read `checkSamples` defaults in `packages/evidence/src/protocol.ts:37`
  (rtol 2e-3, atol 2e-4; NaN reference values are skipped).
- Wrote `scripts/03-forced-fusion-single-kernel.mjs`: compiles the same attention twice, once with
  the default pipeline and once with `p.replace("loop/fusion", unguarded)` where
  `unguarded = k.pass("loop/fusion").rules(createFusionRule({ decide: () => true })).order("reverse")`;
  prints kernels, nests, legal maps, the model's time, and evaluates both Loop IR graphs.
- Ran `NEST=1 node .../03-forced-fusion-single-kernel.mjs` (B=1 H=2 L=5 S=7 D=4) and
  `node .../03-forced-fusion-single-kernel.mjs 2 12 128 128 64`.

### Why

- Every downstream consumer keys on `attrs.expr`: tile/kernel/gpu identities, `programOf`, the
  simulator reference and `workOf`. A representation that keeps one `loop.kernel` with an ordinary
  expression reuses all of it; a new node kind without `expr` would need changes in each.

### What worked

- Unguarded fusion yields one kernel, `k_matmul_ew_softmax_reduce`, with 6 reductions: the row max
  (`acc2`), the row sum (`acc4`) and the P·V reduction (`acc5`), each recomputing the QK^T inner
  product (`acc1`, `acc3`, `acc0`).
- Its Loop IR evaluation equals the guarded pipeline's: max abs vs the frontend reference is
  5.96e-8 for both (toy shape) and 1.34e-7 for both (BERT shape).
- Legal maps for it are only `thread,row`; at the BERT shape the model predicts 1543.0 us for the
  fused kernel against 44.1 us for the guarded three kernels. Work grows from recomputing the scores
  in three sweeps and once per output column d.

### What didn't work

- `createFusionRule({ maxWorkGrowth: Infinity })` threw
  `TypeError: maxWorkGrowth must be finite and nonnegative` (loop.js:360). Used
  `decide: () => true` instead, which bypasses the guard through the documented policy hook (loop.js:402).

### What I learned

- The fusion guard is right to reject this merge for every existing mapping; the merge is only
  profitable together with a mapping that computes each score tile once and shares it across d.
- The online softmax is a materialization choice, not a semantic one: the three-pass expression is the
  reference, and an online-softmax kernel is one legal way to evaluate it, with reordering error around
  1e-6 (Step 3), far inside `checkSamples`' rtol 2e-3 / atol 2e-4.
- W-10-attention.md says the compiler "needs a pair-valued reducer"; the experiment shows the pair
  reducer is needed inside the generated kernel, not in the Loop IR.

### What was tricky to build

- `compileScript`'s `transformPipeline` hook (apps/workbench/src/compile.js:26-29) is what makes
  this experiment possible without editing source; the pass to replace is named `loop/fusion`.

### What warrants a second pair of eyes

- The recognizer that identifies this expression must be robust to the shape-dependent partition
  seen in Step 2. Inlining is deterministic and expressions are hash-consed up to renaming
  (loop.js:2-3, 24-38), so fully fusing the region should give one canonical form; the
  implementation must test that at several shapes.

### What should be done in the future

- Write the design doc around: `fuse_attention` rule, `matchSoftmaxContraction` recognizer,
  `MAP=flash` Tile mapping with `BR`/`BC` knobs, `matFlash` Kernel IR materializer.

### Code review instructions

- `NEST=1 node ttmp/2026/11/01/KILN-007--kiln-fused-attention-intern-analysis-design-and-implementation-guide/scripts/03-forced-fusion-single-kernel.mjs [B H L S D]`.

### Technical details

- Fused nest skeleton: `for b,h,i: m = max_s score(i,s); l = sum_s exp(score(i,s)-m); for d: out = sum_s (exp(score(i,s)-m)/l) * v[s,d]`,
  where `score(i,s) = add_rn(mul_rn(sum_e q[i,e]*k[s,e], scale), mask[i,s])`.

## Step 5: Writing the design doc, a full re-read, and ticket bookkeeping

This step wrote the design doc in the writing-style section order, related seven key files, updated
the ticket index, added one task per implementation phase, and re-read the whole design doc as the
coordinator asked. The re-read found three factual slips, which I corrected. The doc contains only
KILN-007 material.

### Prompt Context

**User prompt (verbatim):** see Step 1. Coordinator instruction during this step (not a user prompt):
keep drafts only in a ticket-specific scratchpad subdirectory and re-read the design doc end to end
before finishing. I wrote no drafts to the shared scratchpad; every file went directly into the ticket.

**Assistant interpretation:** Deliver the guide and the docmgr hygiene; do not upload.

**Inferred user intent:** A reviewable, evidence-backed guide the parent agent can upload as is.

**Commit (code):** none (no commits, by instruction).

### What I did

- Wrote `design-doc/01-fused-attention-analysis-design-and-implementation-guide.md` (12 sections,
  5 decision records, 3 mermaid diagrams, `matFlash` pseudocode, smem budget table, CPU/GPU test matrix).
- Verified each cited line range with `grep -n` before writing (Step 3 explains why).
- `docmgr doc relate --doc <design doc>` with 7 `--file-note` entries: fx_compose.py, loop.js,
  tile.js, kernel.js, program.js, targets.js and probe 675's result.json.
- Edited `index.md` (Summary and Overview) directly; ran `docmgr task add` once per phase
  (Phases 0-6 and Deferred).
- Re-read the design doc end to end; recomputed every number in the smem table
  (`4*(BR*D + 2*BC*D + BR*BC + 2*BR)`) and the hand cost estimates.

### Why

- The writing-style order makes the doc predictable for an intern; the decision records keep the
  representation choice (Decision 1) visible instead of buried in prose.

### What worked

- All eight smem table rows recomputed to the printed values. The `doc relate` call reported
  "added 7, updated 0, removed 0".

### What didn't work

- The re-read found three slips: "16 times larger than all of its inputs combined" (it is 16× one
  L×D input and about 5× q, k, v combined); an unverified claim that 0.167 was "the lowest of the
  accepted attention work" (removed); and 12.4 µs for 3.28 MB at 259 GB/s (it is 12.7 µs). All fixed.
- `docmgr task add` was slow: the loop over eight tasks was moved to the background after 180 s with
  three tasks added. Likely cause is contention with the sibling agents' docmgr calls on the same
  repository; recovery was to let the job finish rather than start a second copy.

### What I learned

- The docmgr CLI holds a repository-wide cost per call (it took over 120 s for one `doc add` under
  contention), so batching `--file-note` arguments into one `doc relate` call is worth it.

### What was tricky to build

- Keeping "existing behavior", "first slice" and "deferred" separate: Section 4 is existing only,
  Phases 1-4 are the CPU-buildable first slice, Phases 5-6 need the GPU, and causal/GQA/tensor cores
  are explicitly deferred with their owning tickets.

### What warrants a second pair of eyes

- Decision 1 (no new reducer; recognize the three-pass expression) is the main architectural bet.
  It rests on Experiment 03; a reviewer should re-run that script at a few more shapes.
- Decision 5 (defer causal masks to KILN-010) trades an earlier feature for keeping every kernel
  checkable against its own expression.

### What should be done in the future

- Phase 0 probe on the GB10; then Phase 1.

### Code review instructions

- Read the design doc Sections 3.7, 4.3, 6.1 and 7 first; re-run the three scripts in `scripts/`.
- `docmgr doctor --ticket KILN-007 --stale-after 30`.

### Technical details

- Tasks added: Phase 0-6 and Deferred, matching design doc Section 9.
- All eight `task add` calls succeeded (ids uia9, rivl, pmjy, 0iwj, tg1m, 9aq2, mhxb, l33y);
  `docmgr changelog update` succeeded; `docmgr doctor --ticket KILN-007 --stale-after 30`:
  "✅ All checks passed". No reMarkable upload (owned by the parent agent).

## Step 6: Implementation kickoff: reading the guide against the code, and a first vertical slice

This step starts the implementation of the guide in the worktree `worktrees/kiln-007-fused-attention`
(branch `impl/kiln-007-fused-attention`). I re-read the design doc, the common implementation rules
and the code it cites (`loop.js`, `tile.js`, `kernel.js`, `emit.js`, `program.js`, `fns.js`,
`targets.js`, the fixpoint loop in `core/kiln.js`), and then built the thinnest end-to-end slice:
recognizer, region fusion pass, `MAP=flash` knobs and cost branch, and the `matFlash` materializer. The
slice compiled the composed SDPA at a toy shape and at the BERT shape into one kernel whose simulated
outputs match the Loop IR reference on the first run (max abs 5.96e-8 and 7.45e-8).

### Prompt Context

**User prompt (verbatim):** "then, can we work on them in parallel (in separate worktrees maybe?)"
and "tell each agent to use their own diary and to folow the diary format as they go, and to write a full report for the go-go-parc vault once they are done ( write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). )"

**Coordinator instruction (not a user prompt):** implement KILN-007 in this worktree; build the fused
kernel on FP32 SIMT products first (probe 675: PyTorch f32 SDPA runs the memory-efficient kernel in
FP32), with a clean seam for tensor-core products (KILN-006 is built in parallel; do not implement
tensor-core code); no GPU host use; follow the common rules file (tests before each commit, local
commits only, diary in investigation format, vault report at the end).

**Assistant interpretation:** Implement the CPU-buildable phases (0 design, 1-4 code and CPU
validation) of the guide, in order, with quality; list the GPU validations that remain.

**Inferred user intent:** Several tickets progress at once without stepping on each other; each one
leaves a reviewable diary and a vault article.

**Commit (code):** none yet (first commit at the end of Step 7).

### What I did

- Read `design-doc/01-...md` end to end and the impl brief.
- Read `loop.js` (expressions, `inlineInto`, `createFusionRule`), `tile.js` (`analyze`, `forkTree`,
  `launch`, `estimate`, `printTile`), `kernel.js` (`KB`, `matTiled`, `materialize`, `valueTypes`),
  `emit.js` (`toCuda`, `toSim`), `program.js` (`simulateKernel`), `fns.js`, `targets.js`, and
  `core/kiln.js:850-890` (the fixpoint scan).
- Ran `NEST=1 node scripts/03-forced-fusion-single-kernel.mjs` to see the fused nest in the
  `contraction: "separate"` spelling (`mul_rn`, `add_rn`, `sub_rn`, `exp`, `div`).
- Wrote three new modules and small hooks in existing ones:
  - `packages/kiln/src/std/attention.js`: `matchSoftmaxContraction`, `createAttentionRule`,
    `fuseAttention`, `attentionPass` (`loop/attention`, short `a`).
  - `packages/kiln/src/std/flash.js`: smem layout, option legality (`flashBR`, `flashBC`,
    `flashTPB`, `flashOptions`, `flashLegal`), `flashLaunch`, `flashCounts`, `printFlash`.
  - `packages/kiln/src/std/flash-kernel.js`: `matFlash` and the `products` seam.
  - `tile.js`: `MAP` gains `flash`; knobs `BR`, `BC`; `an.attention`; fork levels; launch,
    estimate and print branches. `kernel.js`: one dispatch line. `export.js`: the thread-id regex
    knows `flash`. `emmy.js`: `pipeline({ attention: "composed" | "fused" })`. `apps/workbench/src/compile.js`:
    `attention` threads through `pipelineFor`/`compileScript`.
- Scratch driver: `.../scratchpad/KILN-007-impl/try.mjs [B H L S D]` (compile with `attention:
  "fused"`, print maps and model times, `simulateKernel` every kernel; `PIN='{"MAP":"flash"}'`).

### Why

- **Deviation from the guide (Section 6.3), deliberate:** the guide puts `fuse_attention` before
  `merge_loop_ops` in the same pass. The fixpoint loop (`core/kiln.js:866-880`) interleaves rules per
  node, so "before" is not a well-defined order there. I run the attention rule as its own pass after
  ordinary fusion instead. Inlining is substitution, so the fully inlined expression of a region does
  not depend on how ordinary fusion partitioned it first; running afterwards only shrinks the region
  search to the two or three kernels ordinary fusion leaves.
- **Region search instead of "inline all producers":** inlining every dominated producer would also
  pull a Q/K/V projection (a matmul, which is a reduction) into the operand fragments and the
  recognizer would then refuse the whole region. The rule does a breadth-first search over producer
  sets (at most 6 kernels, 48 states) and stops at the smallest set the recognizer accepts.
- **One lane per row computes nothing alone:** the guide's pseudocode (Section 8.2) has lane 0 publish
  `m'` and `alpha` through shared memory. I let every lane of a row compute them from the same shared
  values in the same order instead; the copies agree bit for bit and two barriers disappear (the guide
  names this as a tuning choice). Probabilities are recomputed per lane rather than written back to
  `sS`, which removes another barrier and a store pass.
- **Default `attention: "composed"`:** a lockstep simulator cannot see intra-block races (guide 11.1),
  so the fused path stays opt-in until the GPU replay (Phase 5).

### What worked

- `node try.mjs` (B=1 H=2 L=5 S=7 D=4, separate contraction): one kernel; with `MAP=flash` pinned,
  `simulateKernel` reports `max abs diff 5.96e-8` over 40 outputs.
- `node try.mjs 2 12 128 128 64` (BERT shape): one kernel, the cost model chooses
  `MAP=flash,TPB=256,BR=16,BC=16` at 27.2 µs predicted (composed path: 44.1 µs, guide 4.2);
  `simulateKernel` `max abs diff 7.45e-8` over 512 sampled outputs.
- `cd packages/kiln && npm test`: `all 48 passed` (the default pipeline is unchanged).

### What didn't work

- First run: `ReferenceError: Cannot access 'kx' before initialization` at
  `flash-kernel.js:27` (`const NEG_INF = kx.num(-Infinity)`). Cause: `kernel.js` imports
  `flash-kernel.js`, which imports `KB`/`kx` back from `kernel.js`; in that cycle `flash-kernel.js`
  evaluates first, so a top-level use of `kx` hits the temporal dead zone. Fix: a frozen literal
  `{ k: "num", v: -Infinity }` and a comment that nothing at module level may touch `KB`/`kx`.
- At the toy shape the cost model prefers `MAP=row` (2.5 µs) over `MAP=flash` (2.7 µs): both are
  launch-bound there, so this is expected, not a defect; tests pin `MAP=flash`.

### What I learned

- `toSim` evaluates each `let` in double and stores it into a `Float32Array`, so one FNS op per `let`
  reproduces the reference's per-op FP32 rounding; nesting ops in one `let` would not.
- Floats are declared once at function scope by `toCuda`, so a `let` inside an `if` assigns a
  function-level variable; that is what makes the "default value, then guarded overwrite" idiom work.

### What was tricky to build

- Marker nodes: the recognizer returns fragments with holes (the raw inner product inside `epi`, the
  normalized core inside `post`). I represent each hole as a load of a negative input index
  (`E.load(-2, [])`, `E.load(-1, [])`), which hash-conses like any node, and the materializer binds
  them by identity through a `leaves` map. A negative input can never be emitted by accident: the
  fragment emitter throws on an unbound marker.

### What warrants a second pair of eyes

- Barrier placement in `matFlash` (three `sync` per key tile: after staging K/V, after the score
  tile, at the end of the tile). The simulator cannot detect a missing one.

### What should be done in the future

- Tests for every phase (Step 7 onwards), NVRTC compile, the probe 676 script.

### Code review instructions

- Start at `attention.js` `matchSoftmaxContraction`/`complete`, then `flash-kernel.js` `matFlash`.
- `node /tmp/claude-1000/-home-manuel-code-wesen-kiln-worktrees-passnet/cd5f3680-095d-4dc0-be9b-3833056c7f6a/scratchpad/KILN-007-impl/try.mjs 2 12 128 128 64`.

### Technical details

- Shared memory (floats): `sQ = BR·(E+1)`, `sK = BC·(E+1)`, `sV = BC·D`, `sS = BR·(BC+1)`. The +1
  row padding makes the inner-product reads of different rows (sQ) and different keys (sK) fall in
  different banks; the guide's table (Section 6.4) assumed unpadded tiles plus two per-row arrays.
- Option legality: `BR ≤ max(8, pow2(L))`, `BC ≤ max(16, pow2(S))`, smem ≤ `smemPerBlock`,
  `TPB ∈ {64,128,256}`, `TPB % BR = 0`, `TPR = TPB/BR ≤ min(32, BC)`, `DPT = ceil(D/TPR) ≤ 32`.

## Step 7: Phase 1-4 tests, two recognizer bugs, importer and export plumbing, NVRTC

This step wrote `packages/kiln/test/attention.mjs` (one file covering the guide's Phases 1-4) and
fixed the two recognizer bugs it exposed. It also threaded the `attention` option through every
compile entry point the GPU replay uses, added a Python test that the importer's exact SDPA output
fuses with unchanged numerics, and compiled every flash kernel variant with NVRTC on this CPU host.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Validate each phase at its CPU boundary before going further.
**Inferred user intent:** Every claim in the receipt is backed by a test or a stored log.
**Commit (code):** c6a4634 — "KILN-007: fused attention (recognizer, region pass, MAP=flash, online-softmax materializer)"; f9bd114 (plumbing, NVRTC scripts; together with Step 8).

### What I did

- `test/attention.mjs`: recognizer fields after forced fusion and after the attention pass (both
  `contraction` settings, the two agree by `__key`); 11 positive variants (ragged, L=1, E≠D, no mask,
  bool mask, per-head and broadcast masks, f16, bf16+bool, unnormalized, B=2/H=3); 4 refusals
  (softmax only, product only, log-softmax, softmax over the other axis); Phase 2 kernel counts,
  scores-as-output, a query projection outside the region, WebGPU decline; Phase 3 fork leaves vs
  `flashOptions` and smem limits; Phase 4 `simulateKernel` on every legal option of several shapes,
  `simulateFull` against `runSerial` element by element with masked rows, CUDA structure.
- `integrations/passnet/kiln_eval.mjs`: optional `attention` request field, reports
  `attention_kernels`; `test_fx_compose.py::test_attention_with_masks` runs composed (0 recognized)
  and fused (2 recognized) against PyTorch at atol 1e-5.
- `scripts/kiln-export.mjs --attention composed|fused` (recorded in `source.attention`),
  `corpus.py compile --attention`, `evaluate_tasks.py` plan key `attention`.
- Ticket scripts `04-export-flash-kernels.mjs` (99 kernels from 10 variants, MAP=flash pinned) and
  `05-nvrtc-compile.py` (NVRTC only, the `cuda_check.py` options); logs in
  `sources/nvrtc-flash-v1/`.

### Why

- The PassBench replay compiles through `evaluate_tasks.py → corpus.py → kiln-export.mjs`; without the
  flag the coordinator could not A/B the family-5 replay.

### What worked

- `node test/attention.mjs`: passes (46 simulated options at this step; 118 after Step 10).
- `python3 -m pytest -q test_fx_compose.py -k attention`: 1 passed.
- NVRTC: `99/99 kernels compile to PTX for compute_121` and `... compute_89`.

### What didn't work

- `matchOf` in the test first read `n.args[i].type` on a run graph: `TypeError: Cannot read
  properties of undefined (reading 'shape')`. Graph nodes hold argument ids, not values; the helper now
  maps ids through `g.nodes`.
- **Recognizer bug 1:** `one recognized kernel for {"variant":"unnormalized"}` failed. Forced fusion
  showed the three copies of the score spelled `in1[0, 0, a2, r]` and `in1[a0, 0, a2, r]`: a size-1
  output coordinate is written `a0` by one view and `0` by another, so the keys differ. Fix: substitute
  every size-1 output coordinate by 0 before matching.
- **Recognizer bug 2 (caused by fix 1):** `one recognized kernel for {"L":1,"S":13,"D":8}` failed: with
  L=1 the query coordinate is now the constant 0 and no coordinate qualifies as the block row. Fix:
  fall back to any row coordinate that keys and values ignore.
- NVRTC first failed for all kernels: `nvrtc: error: failed to open libnvrtc-builtins.so.13.0`. Cause:
  the wheel's `lib` directory is not on the loader path. Fix: `LD_LIBRARY_PATH=$NV/lib`.
- Bool masks in the SIMT simulator: `SIM ERR F_g3 is not defined` (fused) and `F_in2 is not defined`
  (composed, same graph). The simulator has no storage for bool values: pre-existing, owned by
  KILN-010. Bool-mask kernels are covered by Loop IR evaluation and NVRTC only.

### What I learned

- `kiln-export`'s end-to-end check is budgeted by `estimateWork` (6e7 operations). The fused
  expression's serial nest recomputes each score per output column (O(L·D·S·E)), so at realistic shapes
  the check is skipped (856M operations at 1×2×128×64 f16). The composed path at family-5's shape is
  over budget as well, so this loses little today, but an attention-aware serial evaluator would be exact
  and cheap (Step 11, future work).

### What was tricky to build

- The region search has to stop before a projection: inlining every dominated producer makes the
  operand fragments contain reductions and the recognizer refuses. Breadth-first over producer sets,
  stopping at the first accepted set, gives the smallest region; the projection test asserts it.

### What warrants a second pair of eyes

- `kiln_eval.mjs` and the export flag change provenance (`source.attention`): replay tooling that
  compares artifacts by source fields should be checked once.

### What should be done in the future

- Bool-mask simulator coverage after KILN-010.

### Code review instructions

- `cd packages/kiln && node test/attention.mjs`; `cd integrations/passnet && python3 -m pytest -q test_fx_compose.py`.
- `NV=~/.pyenv/versions/3.13.2/lib/python3.13/site-packages/nvidia/cu13; node $T/scripts/04-export-flash-kernels.mjs k.json && LD_LIBRARY_PATH=$NV/lib python3 $T/scripts/05-nvrtc-compile.py k.json --nvrtc $NV/lib/libnvrtc.so.13 --arch 121 --include $NV/include`.

### Technical details

- NVRTC options: `--gpu-architecture=compute_121 -std=c++14 --use_fast_math -I$NV/include`.

## Step 8: Register tiling, partial maxima, and a cost gate on fusion

The first kernel (one row per lane group, one score per lane) was correct, but the analytic model said
it is shared-memory bound: 1039 µs against 1167 µs composed at B=1 H=16 L=S=1024 D=64. This step
register-tiles both products, replaces the score tile by per-lane partial maxima to free shared memory,
and makes the attention rule fuse only where the model predicts no loss.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** "Replacing the composition where profitable": the kernel must win, and
the rule must not fuse where it would lose.
**Inferred user intent:** A fused path worth qualifying on the GPU.
**Commit (code):** f9bd114 — "KILN-007: register-tiled flash kernel, cost-gated fusion, --attention plumbing, NVRTC check"

### What I did

- New knob `RM` (rows per thread, 1/2/4). Threads form `G = BR/RM` row groups of `TPR = TPB/G` lanes;
  a thread owns rows `g + k·G`, keys `lane + n·TPR` (`KN = BC/TPR`) and columns `lane + q·TPR`.
- Scores: an `RM×KN` register tile per thread (each loaded Q value feeds KN products, each K value RM).
- Probabilities: computed once by the thread that holds the score, written to `sP`; P·V reads `sP`
  (RM values) and `sV` (DPT values) per key for RM·DPT products.
- Row maxima: each lane writes the maximum of its own KN scores to `sM[row·TPR + lane]`; every lane of
  the row reduces the TPR partials. The maximum is exact in any order, so all copies of `m'` agree.
  This removed the BR×BC score tile from shared memory.
- Bank-conflict-free strides: Q/K rows `E+1` (odd), `sP` rows `SS ≡ TPR (mod 32)`.
- `tile.js bestEstimate(expr, shape, inShapes, t)`: the cheapest leaf of a kernel's fork tree;
  `createAttentionRule({ legal, cost })` skips a region when the best flash option is slower than the
  sum of the region kernels' best options. The pass is built in `emmy.js` (`fuseAttention`,
  `attentionPass`) to keep `attention.js` free of a `tile.js` import cycle.

### Why

- Shared-memory wavefronts, not FLOPs, bound a SIMT inner product whose operands both come from shared
  memory: FMAs per load are `RM·KN/(RM+KN)` for the scores and `RM·DPT/(RM+DPT)` for P·V.

### What worked

Model predictions on gb10 (`cost.mjs` in the scratch dir, separate contraction, importer's softmax):

| shape B,H,L,S,D | composed | fused (chosen option) | DRAM composed → fused |
|---|---:|---:|---|
| 2,12,128,128,64 | 44.1 µs | 20.2 µs (BR=32 BC=32 TPB=256) | 9.13 → 3.13 MB |
| 1,2,512,512,64 (family 5) | 55.7 µs | 45.8 µs (BR=16 BC=64 TPB=256) | 10.00 → 2.22 MB |
| 1,16,1024,1024,64 | 1166.8 µs | 622.8 µs (BR=32 BC=32 TPB=256) | 276 → 39.4 MB |
| 1,8,256,256,128 | 63.1 µs | not fused (gate: flash 71.4 µs) | unchanged |

- 95 simulated options pass after the rewrite (`max abs` < 1e-5 everywhere).

### What didn't work

- RM=8 with RM·KN ≤ 32 (tried, reverted): the best option did not improve (635 µs, occupancy 0.08);
  64-thread blocks with 45 KiB of shared memory leave too few warps per SM.
- After the gate, the Phase 3 test failed (`assert.ok(legalMaps(an).includes('flash'))` was given an
  unfused kernel at D=128): the test now builds its expression by forced fusion; a new assertion checks
  that the gate keeps D=128 composed.

### What I learned

- Within 48 KiB of static shared memory an FP32 SIMT flash kernel stays shared-memory bound in the model
  (about 2 FMAs per shared load). The remaining factor is what tensor cores (KILN-006) and dynamic shared
  memory would buy.

### What was tricky to build

- The partial-maximum layout: `sM[r·TPR + lane]` is written by every lane and read by every lane of the
  row after a barrier; the old design had each lane re-read the full BC-wide score row.

### What warrants a second pair of eyes

- Four barriers per key tile now (after staging; after the partial maxima; after `sP`; at the end).
  The `sP` barrier is the one a reviewer should confirm is needed (yes: P·V reads other lanes' `sP`).
- The gate compares model predictions only; measured evidence for the composed kernels is not consulted.

### What should be done in the future

- Measure on the GB10 (Phase 5); feed measurements back so the gate and the decider agree with hardware.

### Code review instructions

- `flash.js` `flashGeometry`, `flashLayout`, `flashTPB`, `flashCounts`; `flash-kernel.js` `matFlash`.

### Technical details

- Legality: `BR % RM = 0`, `TPB % G = 0`, `TPR ≤ 32`, `KN = BC/TPR` integral ≥ 1, `RM·KN ≤ 16`,
  `RM·DPT ≤ 64`, shared bytes `4·(BR(E+1) + BC(E+1) + BC·D + BR·SS + BR·TPR) ≤ smemPerBlock`.

## Step 9: The product seam for tensor cores (coordinator message: KILN-006 finished)

The coordinator reported that KILN-006 exposes `mmaAccumulators`, `mmaWarpStep` and `mmaAccElements`
from `kernel.js` (branch `impl/kiln-006-tensor-cores`, not merged), with the invariant that every warp
executes each mma with all 32 lanes active, and a known gap: the first product's accumulator layout is
not the second product's A-operand layout. I reshaped the seam to fit, without writing tensor-core code.

### Prompt Context

**User prompt (verbatim):** see Step 6. **Coordinator message (not a user prompt):** "Shape your product
seam so these can plug in later; keep your own implementation FP32 SIMT."
**Assistant interpretation:** Make the SIMT products replaceable by an implementation built from those
helpers.
**Inferred user intent:** KILN-006 and KILN-007 merge without rework.
**Commit (code):** a141628 — "KILN-007: element-based product seam for tensor-core score and P·V tiles"

### What I did

- Read `worktrees/kiln-006-tensor-cores/packages/kiln/src/std/kernel.js:255-292` and its guide
  Section 13 (read only).
- `products.simt.scores(kb, ctx)` now returns the inner products a thread holds as elements
  `{ slot, row, key, value }`, the shape of `mmaAccElements` (`{ row, col, name }`); the epilogue,
  partial maxima and probabilities iterate over elements. `products.simt.pv(kb, ctx)` owns the whole
  key-tile P·V update.

### Why

- P already goes through shared memory (`sP`, row-major `[row][key]`), so the layout gap is bridged by
  construction: an mma P·V reads A fragments from `sP` and B fragments from `sV` (row-major `[key][d]`,
  the B layout `mmaWarpStep` expects).

### What worked

- Tests unchanged and passing; NVRTC 99/99 on both architectures.

### What didn't work

- No failures observed.

### What I learned

- The scores product is the harder half for mma: `mmaWarpStep` reads B as `[k][col]`, i.e. `K` staged
  `[e][key]`, while the SIMT kernel stages `sK` as `[key][e]`.

### What was tricky to build

- Keeping the score call outside every guard, so an mma version can satisfy the all-lanes-active rule.

### What warrants a second pair of eyes

- The remaining mma prerequisites listed in the seam comment: an mma thread geometry in `flash.js`, a
  `[e][key]` K tile, and partial maxima keyed by an element's row.

### What should be done in the future

- After KILN-006 merges: an `mma` product in `flash-kernel.js` and a `PRODUCTS`-style knob.

### Code review instructions

- `flash-kernel.js`, the "product seam" comment block, `scoresSimt`, `pvSimt`.

### Technical details

- `ctx = { att, lay, BC, rows, keys, cols, l, acc, colOk }`.

## Step 10: Probe 676, and a correctness gap it found on the CPU: fully masked rows are 0 in PyTorch

I wrote probe 676 (Phase 0) for the GPU host and gave it a CPU dry-run mode. The dry run answered one of
its questions on this machine already: with torch 2.11 on CPU, every SDPA backend that runs returns 0 for
a fully masked row (bool or `-inf` additive mask), for f32, f16 and bf16. The guide (Section 8.3)
assumed NaN, and Kiln's composed lowering produced NaN. I changed the SDPA lowering to match PyTorch.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Phase 0 is CPU design plus a GPU run; record what the CPU can answer.
**Inferred user intent:** Kiln matches PyTorch, including at the edges.
**Commit (code):** b21c7a5 — "KILN-007: fully masked SDPA rows are 0 (N.safeSoftmax); probe 676 script"

### What I did

- `scripts/676-low-precision-attention-probe.py`: f16/bf16, L=128/512, masks add/bool/none, backends
  default/flash/efficient/math/cudnn; five float64 references (`p32`, `pq_l32`, `pq_lq`, `pq_exp2`,
  `s_q`) and the closest; a fully masked row per dtype and mask kind. `DEV` falls back to CPU.
- `python3 676-...py out.json` on CPU; result in `sources/probe-676-cpu-dry-run/result.json`.
- `N.safeSoftmax(x, dim)` in `tensor.js`: `exp(x − max(amax(x), −FLT_MAX)) / max(sum, FLT_MIN)`;
  `fx_compose.lower_sdpa` uses it; `prepare_study.py`'s operator list knows it.
- Recognizer: `floored(x, fn)` accepts `max(red, c)`; the match carries `mFloor`, `lFloor`.
  `matFlash` starts `m` at `mFloor` and divides by `max(l, lFloor)`.
- Tests: masked-row comparison for both softmax forms (safe → 0, plain → NaN); `test_fx_compose`
  compares a fully masked bool row and a fully `-inf` additive row with PyTorch, composed and fused.

### Why

- Floors instead of a select on `max > −inf`: a comparison yields a bool value, which the SIMT
  simulator cannot hold (KILN-010). The floors are bit-identical on every row with a finite entry: the
  maximum is above `−FLT_MAX`, and a live row's sum is at least 1 (its maximum contributes `exp(0)`).

### What worked

- CPU dry run, every running backend, fully masked row: `{"nan": false, "zero": true}`.
- Composed and fused both match PyTorch on the fully masked rows (atol 1e-5); 118 simulated options.

### What didn't work

- The first Python run failed with `CalledProcessError ... kiln_eval.mjs returned non-zero exit status 1`:
  `json.dumps` writes `-Infinity`, which `JSON.parse` rejects. Fix: the test spells non-finite values as
  strings and `kiln_eval.mjs` converts them with `Number`.
- CPU dry run: `efficient` and `cudnn` raise "No viable backend" (CPU has neither); the GPU run is
  needed for them, and for the low-precision rounding question (on CPU the closest reference varies by
  case between `p32`, `pq_l32`, `pq_lq` and `pq_exp2`, which is not evidence about the GPU kernels).

### What I learned

- The guide's Section 8.3 assumption (NaN for fully masked rows) is wrong for torch 2.11 CPU.

### What was tricky to build

- Keeping the change exact: floors that never bind on a live row, and a kernel that reproduces
  `max(M, floor)` by initializing `m` to the floor rather than adding a guard.

### What warrants a second pair of eyes

- Every SDPA kernel identity changes (the expression has two more `max` ops), so evidence recorded for
  composed SDPA kernels no longer applies to them.

### What should be done in the future

- Run probe 676 on the GB10; if a GPU backend returns NaN, the lowering must follow the backend the
  evaluator uses.

### Code review instructions

- `tensor.js` `N.safeSoftmax`; `attention.js` `floored`, `matchExp`, `lsumOf`; `flash-kernel.js` `m0`, `den`.

### Technical details

- `−FLT_MAX = -3.4028234663852886e38`, `FLT_MIN = 1.1754943508222875e-38` (both exact in f32).

## Step 11: Ticket bookkeeping, vault article, and the GPU hand-off

This step closed the CPU-side work: tasks Phases 1-4 checked, three follow-up tasks added, a changelog
entry, five related files on the design doc, a Section 13 "implementation status and deviations" in the
design doc, `docmgr doctor --ticket KILN-007 --stale-after 30` clean, and the vault article written and
pushed. Phase 0's probe is written and dry-run; Phases 5 and 6 need the GB10.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Finish with a reviewable ticket and a textbook-style vault report.
**Inferred user intent:** The coordinator can run the GPU jobs from the receipt alone.
**Commit (code):** db0d4f0 — "KILN-007: design-doc implementation status, tasks, changelog, related files"

### What I did

- Vault: `Projects/2026/11/01/ARTICLE - Kiln - Fused Attention as a Recognized Expression and an
  Online-Softmax Kernel.md` in go-go-parc, commit f43794d, `git pull --rebase` then push succeeded.

### What worked

- `docmgr doctor`: "✅ All checks passed". Final suites: `npm test` all 49 passed; `pytest -q` 177 passed.

### What didn't work

- No failures observed.

### What I learned

- N/A.

### What was tricky to build

- N/A.

### What warrants a second pair of eyes

- The default stays `attention: "composed"`; flipping it is a Phase 5 decision.

### What should be done in the future

GPU validations remaining (coordinator):
1. Probe 676: `python 676-low-precision-attention-probe.py OUT.json` in the evaluator image on the GB10.
2. ptxas registers/spills: `sources/nvrtc-flash-v1/flash-kernels.json` through
   `apps/workbench/test/cuda_check.py --nvrtc … --ptxas $(which ptxas) --arch 121`.
3. Family-5 replay: `evaluate_tasks.py` plan with `"attention": "fused"` (and `"contraction":
   "separate"`) against the same plan with `"composed"`.

### Code review instructions

- Design doc Section 13; then Steps 6-10.

### Technical details

- Branch `impl/kiln-007-fused-attention`: c6a4634, f9bd114, a141628, b21c7a5, 32d2104, db0d4f0.
