---
Title: Diary
Ticket: KILN-006
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
Summary: ""
LastUpdated: 2026-11-01T07:32:28.302727435-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

This diary records the research behind the KILN-006 design guide, "Tensor-core matrix products: analysis, design and implementation guide" (`design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md`). Each step is written when the phase it describes ends, not reconstructed afterwards.

## Step 1: Orientation in the six-IR pipeline and the matrix-product path

I read the skill files that govern this deliverable, created the two ticket documents, and read the Kiln source along the path a matrix product takes: frontend op, decomposition, Loop IR, Tile IR scheduling, Kernel IR materialization and emission. The goal was to find where a tensor-core path would attach before writing any design. The main outcome is that there is no matrix-product operation below the Tensor IR: `lowerMatmul` and `lowerLinear` decompose a product into `sum(mul(view, view))`, and the Tile IR recognizes the pattern again structurally, in `analyze`, as a `contraction`. A tensor-core schedule therefore belongs beside `MAP=tiled`, keyed on the same contraction analysis, rather than in a new frontend op.

### Prompt Context
**User prompt (verbatim):** "Create new docmgr tickets for tensor-core matrix products  and fused attention and cumsum and writing mutated inputs (one docmgr + design doc per task). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

Earlier question from the same user (verbatim): "and can we build them with CPU only"

Mid-task instruction from the user, relayed by the coordinating agent while this step was in progress (verbatim): "tell each agent to use their own diary and to folow the diary format as they go". From this point the diary is written one step per research phase, at the end of each phase.

**Assistant interpretation:** Write the KILN-006 intern guide for tensor-core matrix products in the existing ticket, with a diary, related files, tasks and changelog; answer the CPU-only question inside the guide. The parent agent owns the reMarkable upload and the other three tickets.
**Inferred user intent:** A new contributor should be able to implement a tensor-core path in Kiln from this guide alone, and know which parts can be built and validated without the GPU host.
**Commit (code):** none (documentation only; the parent instructed no commits).

### What I did
- Read `~/.claude/skills/ticket-research-docmgr-remarkable/SKILL.md` with `references/writing-style.md` and `references/deliverable-checklist.md`, `textbook-authoring/SKILL.md`, `docmgr/SKILL.md` and `diary/SKILL.md` with `references/investigation-entry.md`.
- Created the diary (`docmgr doc add --ticket KILN-006 --doc-type reference --title "Diary"`) and the design doc (`--doc-type design-doc`).
- Read `packages/kiln/src/std/emmy.js` (pipeline assembly, lines 18-38), `matmul.js` (specs, references, `lowerMatmul`/`lowerLinear`, lines 28-62), the TF32 rules in `tensor.js` (595-612) and `fns.js` (`roundTf32`, lines 6-16), `loop.js` (expressions, `schedule`, `compileSerial`), all of `tile.js` (knobs, `analyze`, `forkTree`, `launch`, `estimate`, `timeModel`, `costPrior`, `predictedCost`), `kernel.js` (`KB`, `matTiled`, `valueTypes`, `materialize`), `emit.js` (`toCuda`, `wgslUnavailableReason`, `toSim`), `program.js` (`simulateKernel`, `metricsOf`) and `scripts/kiln-export.mjs` (`compileOne`, cost gate).
- Read the GPU probe results `KILN-005/sources/gpu-probes-v1/result.json` and `gpu-probes-v2/result.json` and KILN-005 reference 49.

### Why
- The brief listed many claims about the code; the skill requires evidence anchored to files, so I verified each before writing.
- Reading the full `tile.js` was necessary because the knob tree, launch geometry and cost model must all change together for a new mapping.

### What worked
- The contraction analysis (`tile.js:76-95`) already produces exactly the description an MMA schedule needs: `A` loads (vary with m, not n), `B` loads (vary with n), the reduction `C` with extent `K`, `M`, `N` and batch dims.
- The probe files confirm the numerics in the brief: linear and 1x1 conv under `allow_tf32` are closest to RNE operand rounding (v1 `rounding.linear.closest = "rne"`), 3x3 conv closest to RNA; f16 and bf16 `linear` with the default reduced-precision-reduction flag differ from round-once in 29.0% and 28.8% of elements (v2 `low_precision_products`).

### What didn't work
- `docmgr doc add` for the design doc timed out after 120 s on the first attempt (it ran in the background; only the diary was created). Rerunning it in the background with a longer timeout succeeded after 41.5 s wall time. No error text was printed; the slowness looks like workspace scanning, not a failure.
- I could not find the absolute PassBench scores the brief quoted (task 32 0.01, 52 0.026, 72 0.059, 5 0.167) in KILN-005 references by grep. Reference 49 line 76 does record task 32 at 0.034 under the transformation program. The guide labels the brief's figures as reported, not re-verified.

### What I learned
- The comment in `fns.js:6-9` and the probe agree that Kiln now emits RNE for TF32 (`roundTf32` adds `0xfff + lsb`), while reference 49 (written earlier) still says Kiln emitted RNA. The code is the current state; the reference is history.
- Kernel IR loads every floating input as f32 (`kernel.js:254-257`, `emit.js:62`); there is no way to keep a value in f16 inside a kernel today. An MMA path needs a packed-half operand type.
- `nn.linear` and `nn.matmul` refuse non-FP32 operands (`tensor.js:331-340`); low-precision products reach Kiln only after the frontend widens them.
- The simulator executes one statement for all threads of a block in lockstep (`emit.js:171-173`), which is the property needed to emulate a warp-collective `mma.sync`.

### What was tricky to build
- Nothing was built in this step. The subtle point was the representation: a matmul is not an op below Tensor IR, so "add a tensor-core matmul kernel" means adding a schedule for a recognized contraction, with legality conditions on the contraction body (it must be exactly one multiply of one A load and one B load accumulated with add).

### What warrants a second pair of eyes
- Whether the brief's absolute scores correspond to the current revision; the guide does not depend on them numerically.

### What should be done in the future
- Locate the per-family absolute scores in the PassBench collections and cite them directly.

### Code review instructions
- Start at `packages/kiln/src/std/tile.js:76-130` (contraction analysis and fork tree) and `packages/kiln/src/std/kernel.js:177-248` (`matTiled`).

### Technical details
- Pipeline: `torch (nn) -d-> tensor -o,l,f,s-> loop -t-> tile -k-> kernel -c-> gpu` (`emmy.js:1-2`).
- Default numerical check tolerance: `checkSamples(..., { rtol = 2e-3, atol = 2e-4 })` (`packages/evidence/src/protocol.ts:37`).

## Step 2: Operand provenance, the simulator, and what a CPU-only machine can check

In this phase I traced how f16, bf16 and TF32 operands arrive at a contraction, how the simulator executes a block, which tests already pin a schedule, and whether this machine can compile CUDA. The result fixes the legality rule of the proposed `MAP=mma`. A contraction may use tensor cores only when every product operand is either a load from f16/bf16 storage, or `round_tf32` of an f32 load. In both cases the MMA hardware computes exactly what the Loop IR reference computes, up to the order of the FP32 accumulation. An FP32 product under `matmulPrecision: "highest"` has no such operand form, so it stays on CUDA cores.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Continue the research for the guide; establish the legality rule and the validation story.
**Inferred user intent:** The guide must say exactly when a tensor-core kernel is correct, and how to show it without the GPU.
**Commit (code):** none.

### What I did
- Read `integrations/passnet/fx_linalg.py:28-49`. FX `linear`/`mm`/`bmm` on f16/bf16 emit `N.cast(N.linear(N.cast(x,"f32"), N.cast(w,"f32"), ...), dtype)`, which is widen, multiply in FP32, round once.
- Read `packages/kiln/test/contraction.mjs` as a test template; found pinning through `compile(..., { params: { MAP: "tiled" } })` (`test/evidence.mjs:121-123`) and the `decide.pinned` policy (`src/core/kiln.js:566-572`).
- Read the simulator generator (`emit.js:201-283`). Each Kernel IR statement becomes a function that loops `for (let t = 0; t < T; t++) if (mask[t]) ...` over all threads of the block. Shared arrays are `Float32Array` (`emit.js:270`).
- Read `lowerConv2d` and `lowerPointwiseConv2d` (`conv2d.js:55-75`).
- Searched for CUDA tools: `which nvcc ptxas` printed `nvcc not found` / `ptxas not found`. A filesystem `find` for `libnvrtc.so*` ran over 60 s without output and I stopped it.
- Read `runtime/python/kiln_launch.py:284-294`. NVRTC compiles each kernel with `--gpu-architecture=sm_XY` for the device it finds.

### Why
- A tensor-core kernel is legal only if it reproduces the reference that `simulateKernel` and the end-to-end check compare against. So the operand provenance had to be traced to the Loop IR body.

### What worked
- Widening f16 to f32 is exact. After fusion the contraction body therefore reads the f16 buffer directly: `inDtypes` holds `f16` and the load converts (`emit.js:62`). The MMA's operands are those same half values.
- `roundTf32` clears the low 13 bits (`& 0xffffe000`, `fns.js:14`). A value it produces is already a TF32 bit pattern, so the MMA path does not need `cvt.rna.tf32.f32`. It can pass the rounded f32 bits unchanged.

### What didn't work
- `which nvcc ptxas` → `nvcc not found`, `ptxas not found`. The `find / -name "libnvrtc.so*"` search did not finish within 60 s and was stopped. Whether a CPU-only NVRTC exists here (for example in a PyTorch wheel) is not established.

### What I learned
- A general convolution sums over three nested reductions (`conv2d.js:56`). `analyze` rejects a contraction whose loop body holds a reduction (`tile.js:83`), so 3x3 convolutions never reach `MAP=tiled` or the proposed `MAP=mma`. Only pointwise convolutions do, and only when they are decomposed with `lowerPointwiseConv2d`.
- The simulator's statement-at-a-time lockstep execution allows a warp-collective statement. All 32 lanes' fragment registers are visible in `F_name[t]` when the statement runs.

### What was tricky to build
- Nothing was built. The subtle point is precision: "f32 accumulate" in MMA does not promise IEEE round-to-nearest after each addition, or any fixed summation order. The guide therefore claims agreement within the existing sampled-check tolerance (`rtol 2e-3, atol 2e-4`), not bit identity.

### What warrants a second pair of eyes
- My fragment layouts for `m16n8k8` (TF32) and `m16n8k16` (f16/bf16) come from memory of the PTX ISA. They must be checked against NVIDIA's "Matrix Fragments for mma.m16n8k8 / mma.m16n8k16" sections before any code is written. The proposed CPU test checks the emulator against itself, so it cannot catch a layout transcription error; only the GPU check can.

### What should be done in the future
- Establish whether NVRTC can be installed on a CPU-only development machine (NVRTC needs no device), so the CPU workflow can include compile checks.

### Code review instructions
- `packages/kiln/src/std/emit.js:171-283` (simulator) and `integrations/passnet/fx_linalg.py:33-49`.

### Technical details
- Legal operand forms for MMA: `in` with `inDtypes[i] in {f16, bf16}`, or `op round_tf32(in)` with an f32 input. Accumulator: `add` with initial value 0.

## Step 3: Probe script — what the contraction actually looks like under FP32, TF32 and f16

I stopped writing the guide and compiled a real linear+bias+ReLU (M=512, K=256, N=384) for the `gb10` target three ways, because the guide's legality rule depends on the exact shape of the contraction body. The probe contradicted my assumption for TF32. The `round_tf32` operand rounding is *not* fused into the matrix-product kernel. The fusion guard keeps it as two separate elementwise kernels that write rounded copies of `x` and `w`, and the contraction body is a plain `mul(in, in)` over f32 buffers. A tensor-core legality check that only inspects the contraction body would never see TF32 operands. The check must look at the operands' producer kernels.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Verify the guide's claims about the Loop IR against a real compile.
**Inferred user intent:** The guide must describe the code as it is.
**Commit (code):** none.

### What I did
- Wrote `scripts/01-print-linear-contraction.mjs` in this ticket. It traces `relu(linear(x, w, b))` for `fp32` (`matmulPrecision: "highest"`), `tf32` (`"tf32"`) and `f16` (operands widened with `N.cast(x, "f32")`, result cast to f16, as `fx_linalg.py` does). It compiles each with `pipeline({ target: target(SPECS.gb10), ... })` and prints each kernel's schedule row, input dtypes, `printE(expr)` and the `analyze(...).contraction` summary.
- Ran `timeout 300 node ttmp/2026/11/01/KILN-006--.../scripts/01-print-linear-contraction.mjs`.

### Why
- My draft of Section 3.5 claimed that the loads in the reduction body become `round_tf32(in0)` under TF32. That needed checking before the legality rule could be written on top of it.

### What worked
Output (verbatim, trimmed to the relevant lines):

```text
--- fp32: k_linear_ew_reduce row=MAP=tiled,BM=128,BN=32,BK=8,TM=2,TN=2 inDtypes=f32,f32,f32
expr: relu(add(in0[a1], add_{r5<256} mul(in1[a1, r5], in2[a0, r5])))
contraction: { M: 512, N: 384, K: 256, A: 1, B: 1, body: 'in,in,mul' }
--- tf32: k_ew row=TPB=1024 inDtypes=f32
expr: round_tf32(in0[a0, a1])
--- tf32: k_ew_2 row=TPB=64 inDtypes=f32
expr: round_tf32(in0[a0, a1])
--- tf32: k_linear_ew_reduce row=MAP=tiled,BM=128,BN=32,BK=8,TM=2,TN=2 inDtypes=f32,f32,f32
expr: relu(add(in0[a1], add_{r5<256} mul(in1[a1, r5], in2[a0, r5])))
--- f16: k_cast_linear_ew_reduce row=MAP=tiled,BM=128,BN=32,BK=8,TM=2,TN=2 inDtypes=f16,f16,f16
expr: round_f16(round_f16(relu(add(copy(in0[a1]), add_{r19<256} mul(copy(in1[a1, r19]), copy(in2[a0, r19]))))))
contraction: { M: 512, N: 384, K: 256, A: 1, B: 1, body: 'in,copy,in,copy,mul' }
```

- The cost model picks `MAP=tiled,BM=128,BN=32,BK=8,TM=2,TN=2` for all three on GB10.
- The f16 body is `mul(copy(load f16), copy(load f16))`: the widening cast survives as `copy`, and the loads read f16 storage directly.

### What didn't work
- My assumption that TF32 rounding is inlined into the contraction was wrong (see above). Inlining `round_tf32` would evaluate it `N` times per element of `x` (and `M` times per element of `w`), so the work guard in `createFusionRule` (`loop.js:391-407`, default `maxWorkGrowth = 1.02`) rejects it.

### What I learned
- TF32 provenance is a property of the operand *buffer*, established by its producer kernel (`expr` = `op round_tf32` at the root). It is not a property of the contraction body.
- `analyze` assigns the loads by the variable they vary with, not by argument order: here `A` is `in2` (x, varies with `a0`) and `B` is `in1` (w). Commutative ordering (`loop.js:60`) reorders the `mul` operands.
- The TF32 graph spends two extra kernel launches and a full read/write of `x` and `w` on rounding. A tensor-core schedule could round during shared-memory staging instead, which is an optimization the guide records as deferred.

### What was tricky to build
- The relative imports: the script lives six directories below the repository root, so every import is `../../../../../../packages/...`.

### What warrants a second pair of eyes
- The producer check must also handle operands that are graph inputs already holding TF32 values (no producer kernel). The guide treats those as FP32, which is conservative.

### What should be done in the future
- N/A beyond the guide's phases.

### Code review instructions
- Run the script from the repository root; compare the three `row=` lines and bodies.

### Technical details
- Script: `ttmp/2026/11/01/KILN-006--kiln-tensor-core-matrix-products-intern-analysis-design-and-implementation-guide/scripts/01-print-linear-contraction.mjs`.

## Step 4: Drafting the guide, and a scratchpad collision with the KILN-009 agent

I wrote the design guide in three draft files and assembled them into `design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md`. When I listed the headings of the assembled doc, Section 3 had titles I had not written ("3.1 The pipeline in one picture", "3.2 Terms"). Its Sections 1-3 belonged to the KILN-009 guide (direct writes of mutated inputs). The KILN-009 agent writes into the same session scratchpad directory and used the same file names, `body1.md` … `body4.md`. Its `body1.md` (07:43) overwrote mine. I also probably overwrote its `body2.md` with mine at 07:45: its assembled doc (07:46) contained my Sections 4-7 between its own Sections 3 and 6. I rebuilt my Sections 1-3 in a private directory, spliced them in, alerted the coordinator, and re-read my whole doc. It now contains only KILN-006 material.

### Prompt Context
**User prompt (verbatim):** see Step 1.
Coordinator instruction after the alert (verbatim): "Thanks. I told the KILN-009 agent to remove your Sections 4-7 from its doc and regenerate its own 4-5. Rebuilding yours in scratchpad/kiln006/ is right; make sure your final KILN-006 doc contains no KILN-009 sections (re-read it end to end), and record the collision in your diary."
**Assistant interpretation:** Finish the guide; repair the contamination in my own ticket only; leave KILN-009 to its agent; document the incident.
**Inferred user intent:** Each ticket's deliverable must be self-contained and correct.
**Commit (code):** none.

### What I did
- Wrote the drafts `body1.md` (Sections 1-3), `body2.md` (4-7) and `body3.md` (8-12) in the session scratchpad and assembled them with a Python splice under the docmgr frontmatter. I also filled `Summary`, `WhatFor` and `WhenToUse`.
- Validated details while writing. I generated the real `printNest` output for the running example (scratchpad `nest.mjs`) and replaced my hand-written loop nest with it; the hand-written version had the bias load in the wrong place. I corrected the `emit.js` ranges (`toCuda` 28-90, `SimMetrics` 285-333) and removed semicolons inside mermaid sequence messages, which mermaid parses as statement separators.
- Detected the collision with `grep -n "^## \|^### "` on the assembled doc. Confirmed it with `ls -la` of the scratchpad (`body4.md`, which I never wrote) and `grep -rl "MAP=mma\|mmaPlan" ttmp/2026/11/01/`, which also matched KILN-009's design doc.
- Sent the coordinator a SendMessage alert naming the affected KILN-009 line range (143-446).
- Rewrote Sections 1-3 into `scratchpad/kiln006/sec1-3.md`, with the probe-verified Section 3.5 applied directly. I replaced the doc's span from `# Direct writes of mutated inputs` up to `## 4. Current-state analysis` with it, saved a backup at `scratchpad/kiln006/design-doc-backup.md`, and re-read the doc end to end.

### Why
- Splicing at the first KILN-006 heading kept my Sections 4-12, which the headings and the end-to-end read showed were intact.
- I did not touch KILN-009's files: the scope rule is "work only inside the ticket directory", and the coordinator owns cross-agent repair.

### What worked
- After the splice, `grep -n "mutat\|Direct writes\|write-back\|writeback\|in-place\|launch-order\|PosionDispatch"` matches only the word "commutative" (line 293), and the heading list runs 1 through 12 in the planned order.

### What didn't work
- Shared scratchpad file names. Symptom: my doc's `### 3.1 The pipeline in one picture` (a KILN-009 heading); KILN-009's doc contained `### 6.1 Operand precision and the legality rule` (mine). Cause: two concurrent agents with the same scratchpad path and the generic names `bodyN.md`. Recovery: the private directory `scratchpad/kiln006/` and a rebuild from my own earlier text.

### What I learned
- A session scratchpad is not private to a subagent when sibling agents run in the same session. Draft files need ticket-specific names or directories.

### What was tricky to build
- Recovering the overwritten Sections 1-3 without the file: I re-created them from the text I had written earlier in this session and applied the two later edits (the probe-verified Section 3.5 and the real loop nest) directly. Sections 4-12 had not been touched, which I confirmed by reading them in full.

### What warrants a second pair of eyes
- The KILN-009 doc must no longer contain KILN-006 Sections 4-7 once its agent has repaired it. Its own Sections 4-5 may need regeneration (the coordinator has told that agent).
- My rebuilt Sections 1-3 against the rest of the doc, for consistency of section cross-references (Section 9 Phase 0, Section 11.2).

### What should be done in the future
- Parallel agents should be told to write drafts under `scratchpad/<ticket-id>/`.

### Code review instructions
- Read `design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md` from start to end, then `grep -n "^## \|^### "` it.

### Technical details
- Affected files: my `design-doc/02-…md` (repaired) and KILN-009 `design-doc/01-direct-writes-of-mutated-inputs-analysis-design-and-implementation-guide.md` (lines 143-446 were mine at 07:46; left to its owner).

## Step 5: Ticket bookkeeping and validation

I related the key files to the design doc, added one task per implementation phase, wrote the changelog entry and the index overview, checked off the research-deliverable task, and ran `docmgr doctor`. Doctor reports all checks passed. Nothing was uploaded to reMarkable (the parent owns delivery), and nothing was committed (as instructed).

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Close out the ticket hygiene the deliverable checklist requires.
**Inferred user intent:** The ticket should be self-describing and pass validation before upload.
**Commit (code):** none.

### What I did
- `docmgr doc relate --doc design-doc/02-…md` with six `--file-note` entries: `tile.js`, `kernel.js`, `emit.js`, `tensor.js`, `targets.js`, and `scripts/01-print-linear-contraction.mjs`. Result: "related 6 file(s) … (added 6, updated 0, removed 0)".
- `docmgr task add` ×7: Phases 0-5 (ids `i7s0`, `8ht2`, `1ump`, `klbe`, `o4p7`, `fhaf`) and the guide deliverable (`8al0`); then `docmgr task check --ticket KILN-006 --id 8al0`.
- `docmgr changelog update --ticket KILN-006 --entry "…"` with the design doc and the probe script.
- Replaced the `## Overview` placeholder in `index.md` and filled its `Summary`.
- `docmgr doctor --ticket KILN-006 --stale-after 30` → `✅ All checks passed`.

### Why
- The deliverable checklist requires related files, tasks reflecting completion state, a changelog and a clean doctor run.

### What worked
- All commands succeeded; the doctor run is clean.

### What didn't work
- Each docmgr invocation took about 40-60 s here, and the harness moves a foreground command to the background after 180 s. I ran the batch in the background and polled with bounded loops. No command failed.

### What I learned
- N/A beyond Step 4's note on scratchpad isolation.

### What was tricky to build
- Ordering: I edited `index.md` only after the background batch finished, so the edit and docmgr's own writes to ticket files could not interleave.

### What warrants a second pair of eyes
- The implementation tasks (Phases 0-5) are open; only the research deliverable is checked.

### What should be done in the future
- Phase 0 (GPU layout and throughput probe) should run first, or in parallel with Phase 1.

### Code review instructions
- `docmgr task list --ticket KILN-006`; `docmgr doctor --ticket KILN-006 --stale-after 30`.

### Technical details
- Doctor output: "## Doctor Report (1 findings) / ### KILN-006 / - ✅ All checks passed".

## Step 6: Implementation begins — Phase 1, the atom table and warp emulator (`mma.js`)

This is the first implementation step, in the worktree `worktrees/kiln-006-tensor-cores` on branch `impl/kiln-006-tensor-cores`. I re-read the design guide, then the code it cites at the current revision (`tile.js`, `kernel.js`, `emit.js`, `program.js`, `targets.js`, `loop.js` schedule, `core/kiln.js` fork tree and pins, `store.js` evidence keying), and wrote `packages/kiln/src/std/mma.js` with its test `packages/kiln/test/mma-layout.mjs`. The module is the single source of truth the guide asks for: atom shapes, operand formats, per-lane fragment layouts, the PTX strings, a pure atom reference with four explicit accumulation orders, the warp-collective emulation `runAtom` that the simulator will call, a representability check, and the shared-memory padding chooser that the materializer and the cost model will both call.

The baseline suite passed before any change (`npm test`: "all 48 passed", 10.9 s). The new test passes on its own.

### Prompt Context
**User prompt (verbatim):** "then, can we work on them in parallel (in separate worktrees maybe?)" and "tell each agent to use their own diary and to folow the diary format as they go, and to write a full report for the go-go-parc vault once they are done ( write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). )"

Coordinator brief (relayed, not user-authored): implement KILN-006 (tensor-core matrix products) in this worktree; give the CUDA emission a faithful simulator/JS-reference model of the fragment semantics (operand rounding, accumulation order as far as the guide specifies) and test codegen structurally; NVRTC compile and numeric GPU validation are deferred to the coordinator; KILN-007 (fused attention) will build on the matrix-product tiles, so keep the tile/kernel-layer API clean and documented. Common rules: no GPU host, no backward-compatibility shims, tests pass before each commit, local commits only, own diary in investigation format.
**Assistant interpretation:** Implement Phases 1-4 of the guide (CPU-buildable), in order, with tests; list Phase 0/5 GPU validations for the coordinator; write the vault report at the end.
**Inferred user intent:** Several Kiln tickets progress in parallel without stepping on each other; each leaves an auditable record.
**Commit (code):** see Step 7 (Phase 1 is committed together with its diary entry).

### What I did
- Re-derived every fragment layout of the guide (Section 6.3) from my reading of the PTX ISA fragment figures and compared formula by formula: `m16n8k8.tf32` A `[g + 8(i&1), t + 4(i>>1)]`, B `[t + 4i, g]`; `m16n8k16` A `[g + 8(r&1), 2t + (e&1) + 8(r>>1)]` with `r = e>>1`, B `[2t + (e&1) + 8(e>>1), g]`; C/D `[g + 8(i>>1), 2t + (i&1)]`. They agree with the guide.
- `mma.js`: `MMA_OPS` (frozen; `aElems`/`bElems` added beside `aRegs`/`perReg`), `accLayout`, `OP_FOR_PRECISION`, `roundOperand`, `representable`, `dot(c, a, b, order)`, `atomReference`, `runAtom(op, w, acc, a, b, order)`, `layoutTables`, `bankDegree`, `mmaSmemLayout(op, {BM, BN, BK})`, `mmaSmemBytes`.
- `test/mma-layout.mjs`: bijection of every A, B and C/D layout; PTX string shape; spot checks at lane 5; a full-warp scatter → `runAtom` → gather equals the sequential FP32 sum computed independently (bit-exact) and is within 1e-5 of the exact sum; every order within an FP32 bound; a constructed order-sensitive dot product; truncation semantics of `chunk-rz`; representability for TF32/f16/bf16; an unrepresentable operand is reported with lane, operand and slot; padding makes TF32 A fragment reads conflict-free.

### Why
- One table consumed by materializer, emitter, simulator and cost model means a transcription error is at least consistent everywhere and fixable in one place (guide Risk 11.1).
- Accumulation order is unspecified by the PTX ISA. The guide specifies "exact products, `Math.fround` after each addition in ascending k" as the default and asks for `reverse`/`pairwise` alternatives. I added a fourth, `chunk-rz`, that models the truncating multi-term adder measured by Fasi et al. (2021) on V100/T4/A100, clearly labelled a model, so a test can bound the effect of a hardware-like adder rather than only of reordering.

### What worked
- `node test/mma-layout.mjs` → "mma layouts are bijections; the emulated atom computes A·B + C with exact products; unrepresentable operands are reported".

### What didn't work
- My first expectation for the order-sensitivity case was wrong: `assert.equal(dot(0, a, b, "reverse"), 1 + 2 ** -23)` failed with `actual 1.000000238418579, expected 1.0000001192092896`. Three products of `2^-24` sum exactly to `3·2^-24 = 1.5 ulp(1)`; adding 1 gives a tie that rounds to even, `1 + 2^-22`. The emulator was right; I fixed the expectation and its message.

### What I learned
- The simulator stores every per-thread value in a `Float32Array`, so any value an `mma` reads has already been rounded to FP32; the emulator only needs the operand-format check, not an FP32 one.
- `kernelInputs` (program.js) seeds every input with unrounded `r()*2-1` FP32 values, including inputs that in the real graph come from a `round_tf32` producer or from f16 storage. An isolated kernel check of a tensor-core kernel would therefore trip the representability check on every operand. This shapes Phase 2/3 (Step 7).
- `k.knobs.canonical` (core/kiln.js:510) includes every key of a knob object, and `EvidenceStore.statsFor` matches records by it. Adding `WM`/`WN` levels that set `0` on every existing option would silently orphan every stored measurement. This shapes Phase 3.

### What was tricky to build
- Round toward zero in `chunk-rz`: `Math.fround` rounds to nearest, so the RZ result is `fround(x)` when that does not exceed `|x|`, and otherwise the float one ulp closer to zero, obtained by decrementing the bit pattern (valid for either sign because IEEE floats are sign-magnitude, and `r ≠ 0` whenever `|r| > |x|`).

### What warrants a second pair of eyes
- The layout formulas. They are now cross-checked twice from the same documentation (guide, and my reading), and are bijections, but only the Phase 0 GPU probe can confirm them.
- `chunk-rz`'s chunk size 4 is an assumption; it does not decide anything by default.

### What should be done in the future
- Phase 0 probe should also measure which accumulation order (if any) of `ORDERS` reproduces GB10 bit-exactly; that would let the simulator default to it.

### Code review instructions
- `packages/kiln/src/std/mma.js` top comment, `MMA_OPS`, `runAtom`, `mmaSmemLayout`.
- `node packages/kiln/test/mma-layout.mjs`.

### Technical details
- `runAtom` returns `null` or the first violation `{ lane, operand: "A"|"B", slot, value }`; NaN counts as representable.
- `mmaSmemLayout` picks `pad ∈ {0, 4, 8}` minimizing the summed per-slot bank-conflict degree of one k-step's fragment reads; ties go to the smaller pad. TF32 `BK=8` → `padA = 4` (stride 12, conflict-free; stride 8 is 2-way).

## Step 7: Phase 2 — the warp-collective `mma` statement through Kernel IR, CUDA, WGSL and the simulator

I added the one new Kernel IR statement, `mma {op, acc, a, b}`, and taught every consumer of Kernel IR about it: `KB.mma`, `valueTypes`, `printKernelBody` (kernel.js); `toCuda`, `wgslUnavailableReason`, `toSim` and `SimMetrics` (emit.js); and the checking path in program.js (`simulateKernel`, `metricsOf`, `regsOf`, a new `operandInputs`). A handwritten two-warp kernel per op (`test/mma-kernel-ir.mjs`) runs through the simulator and matches `atomReference` bit for bit, its CUDA text has the expected PTX and constraint list, WGSL refuses it, and a partial warp and an unrepresentable operand are both reported. The full suite passed (50 files).

### Prompt Context
**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Phase 2 of the guide: statement and emitters, tested on a handwritten body.
**Inferred user intent:** A simulable, emit-able tensor-core primitive that the materializer (Phase 3) and later KILN-007 can target.
**Commit (code):** the commit following this entry — "KILN-006 Phase 2: warp-collective mma statement in Kernel IR, CUDA, WGSL and the simulator".

### What I did
- kernel.js: statement documented in the header; `KB.mma(op, acc, a, b)` registers the accumulators as floats; `valueTypes` refuses a non-f32 fragment and types accumulators f32; printer line `mma.<op> {acc…} += {a…}·{b…}`.
- emit.js: `mmaOpsOf(body)`, `cudaMma(s)` (exported, the single CUDA spelling), `CUDA_PACK` helpers `kiln_pack_f16`/`kiln_pack_bf16` emitted once per kernel when an op needs them, `cuda_fp16.h`/`cuda_bf16.h` included on the same condition; WGSL refusal `tensor-core mma (<op>) has no WGSL lowering`; simulator case that counts active lanes per warp, skips an inactive warp, reports a partial warp, calls `runAtom` (bound into the generated function as `MMA`, with the order as `ORDER`), reports a violation; `toSim(K, { mmaOrder })`; `SimMetrics.mma(flops)` (one warp instruction, `tensorFlops`), `badMma`, `badMmas`.
- mma.js: `fragmentIx(op, "a"|"b"|"c", slot, lane)` returns the coordinates as `Ix` over `lane/4`, `lane%4`, derived from the numeric table by sampling and verified affine over all 32 lanes, so the materializer never re-states a layout.
- program.js: `operandInputs(kern, ins)` rounds the kernel's A and B inputs to the operand format when `K.mma` is set; `simulateKernel(…, { mmaOrder })`; the simulator cache key includes the order; a reported `mma` problem fails the check; `metricsOf` passes `tensorFlops` and the target's tensor rate to `timeModel`.

### Why
- One emulated atom per warp is possible because the simulator already runs a statement for all threads of the block before the next (emit.js:171-173): all 32 lanes' fragments are in the per-thread arrays when the `mma` statement runs.
- A non-instrumented run (`simulateFull`) has no metrics object, so a violation throws there rather than being silently ignored (`MMAFAIL`).
- `operandInputs` is the answer to the problem found in Step 6: the kernel is only legal because its producer delivers operand-format values, and an isolated check must model that. Seeded inputs themselves (`kernelInputs`, used for content ids and the workbench job protocol) are unchanged, so no existing record identity moves.

### What worked
- `node test/mma-kernel-ir.mjs` → "the mma statement simulates as one emulated atom per warp, renders inline PTX, and is refused by WGSL" on the first run. `npm test` → "all 50 passed".

### What didn't work
- No failures in this step.

### What I learned
- The C string in `asm volatile` must contain the two characters `\n`; in the JS template that is `\\\\n` inside a Python-written source (escaping twice). The test asserts the exact emitted text, so a wrong escape would be caught.

### What was tricky to build
- Packing order: `kiln_pack_*(lo, hi)` puts `lo` in `.x`, the low 16 bits, which is where the PTX ISA puts the lower-indexed element of an `.f16x2` register. The materializer's slot order (`e = 2j` low, `2j+1` high) and `MMA_OPS` both follow that convention; the emitter is the only place that knows registers exist.

### What warrants a second pair of eyes
- Whether NVRTC for `sm_121` accepts the inline asm verbatim (deferred to the coordinator). A sample of the emitted bf16 source is in Technical details.
- Using `__float_as_uint` for TF32 operands relies on the legality rule (low 13 bits zero). If a future change feeds unrounded values, hardware behavior is unspecified; the simulator would report it.

### What should be done in the future
- The handwritten kernels of `test/mma-kernel-ir.mjs` are a ready-made Phase 0 layout probe: compile them with NVRTC on GB10, run them on coordinate-encoding inputs and compare with `atomReference`.

### Code review instructions
- emit.js `cudaMma`, the `case "mma"` of `toSim`; kernel.js `KB.mma`, `valueTypes`; program.js `operandInputs`.
- `node packages/kiln/test/mma-kernel-ir.mjs`; `cd packages/kiln && npm test`.

### Technical details
Emitted CUDA for the handwritten bf16 atom (excerpt):
```cuda
#include <cuda_bf16.h>
__device__ __forceinline__ unsigned kiln_pack_bf16(float lo, float hi) { __nv_bfloat162 h = __floats2bfloat162_rn(lo, hi); return *reinterpret_cast<unsigned*>(&h); }
    a0 = __bfloat162float(src0[((2 * (lane % 4)) + (16 * (lane / 4)))]);
    asm volatile("mma.sync.aligned.m16n8k16.row.col.f32.bf16.bf16.f32 {%0,%1,%2,%3}, {%4,%5,%6,%7}, {%8,%9}, {%0,%1,%2,%3};\n" : "+f"(c0), "+f"(c1), "+f"(c2), "+f"(c3) : "r"(kiln_pack_bf16(a0, a1)), "r"(kiln_pack_bf16(a2, a3)), "r"(kiln_pack_bf16(a4, a5)), "r"(kiln_pack_bf16(a6, a7)), "r"(kiln_pack_bf16(b0, b1)), "r"(kiln_pack_bf16(b2, b3)));
```

## Step 8: Phase 3 — `MAP=mma` in Tile IR and the `matMma` materializer

The tensor-core mapping now exists end to end on CPU. `scheduleRule` computes `operandPrecision` for every kernel and asks `mmaPlan` whether the contraction can run on tensor cores; if so the fork tree offers `MAP=mma` with `BM`, `BN`, `BK`, `WM`, `WN` levels. `matMma` (kernel.js) writes the warp-tiled GEMM from three exported building blocks (`mmaAccumulators`, `mmaWarpStep`, `mmaAccElements`) that KILN-007 can reuse. Pinned `MAP=mma` kernels for TF32, f16 and bf16 linear layers, a batched matmul, tile tails and fused epilogues all pass `simulateKernel` against the Loop IR reference, under every accumulation order. The default compile is byte-identical to the base revision for 36 program/target/precision combinations.

One design change against the guide came from the first run of the tail test: at small sizes fusion *does* inline the `round_tf32` producers into the contraction, so the body is `mul(round_tf32(in0[..]), round_tf32(in1[..]))`. The guide's `isProductOf` would refuse it. I generalized the operand rule to "a load under a chain of format functions" (`copy`, `round_tf32`, `round_f16`, `round_bf16`) and made the tile loader apply the chain once per staged element. That is the guide's deferred "rounding during staging" (Section 11.2), obtained for free where fusion already made the decision.

### Prompt Context
**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Phase 3: `operandPrecision`, `mmaPlan`, `MAP=mma` with `WM`/`WN`, fork tree, launch, print, `inPrecisions`, `matMma`, `materialize` dispatch, tests with `MAP=mma` pinned.
**Inferred user intent:** A correct, CPU-validated tensor-core schedule that changes nothing until chosen.
**Commit (code):** the commit following this entry — "KILN-006 Phase 3: MAP=mma mapping, mmaPlan legality and the matMma materializer".

### What I did
- core/kiln.js `expandFork`: a level value `undefined` leaves the knob unset. `WM`/`WN` levels return `[undefined]` off `MAP=mma`, so no existing option gains keys (Step 6 finding: `k.knobs.canonical` keys evidence records by every key).
- tile.js: `MAP` gains `"mma"`; knobs `WM ∈ {16,32,64}`, `WN ∈ {8,16,32,64}`; `operandPrecision(n)`; `operandChain` + `mmaPlan(an, prec, t)` → `{ op, operand, a, b, aFns, bFns, roundsA, roundsB }` or `{ reason }`; `legalMaps(an, plan)`; `forkTree(an, t, plan)` (BK multiple of the atom's k, padded shared tiles within `smemPerBlock`, `warps·32 ≤ maxThreadsPerBlock`); `launch(an, kn, plan)`; `regsEstimate(kn, values, op)`; `estimateMma` (also Phase 4 material, see Step 9); `printTile` mma branch; `planOf(node)`; `tile.kernel` attr `inPrecisions` (in `keyIgnore`); `scheduleRule` passes the plan; `costPrior` and `predictedCost` pass the plan to `estimate`.
- kernel.js: `mmaAccumulators`, `mmaWarpStep(kb, op, lane, acc, a, b)`, `mmaAccElements(op, acc, lane)`; `matMma(an, kn, plan)`; `materialize` refuses an illegal pinned plan by name and records `K.mma = { op, operand, a, b }` (`a`/`b` null when the operand is rounded in-kernel, so `operandInputs` leaves that input alone).
- test/mma-kernel.mjs (new): the cases of guide Section 10.1 (see Technical details).
- Comparison script (scratch, `KILN-006-impl/cmp/dump.mjs`): compiles attention, swiglu, linear+relu, a 1024³ matmul, an f16 linear and a 1x1 conv for gb10, a100 and rtx5090 under `highest` and `tf32`, and prints every kernel's name, identity, row, knobs, CUDA and WGSL hashes and the program's `predictedCost`. Run against `git archive 373766b` and against the working tree: `IDENTICAL` (123 lines, 87 kernels).

### Why
- Legality per operand chain rather than per body shape: the values are what matter. `round_tf32(load)` is exactly as TF32-representable as a load from a `round_tf32` producer, and rounding at staging is the same RNE function (`fns.js roundTf32` / `kiln_round_tf32`), as the TF32 decision record requires.
- Tile loads write the `mv` temporary, not `tv`: KILN-008 owns the reuse problem of `matTiled`'s `tv`; a distinct name keeps this path independent of that fix.
- `costPrior` returns `Infinity` for an `mma` option when the target's tensor rate is unknown and other maps compete; with `MAP=mma` pinned it ranks the remaining knobs with the FP32 peak as prior. Reason: the guide's claim that the pessimistic prior alone keeps `mma` from winning does not hold in the issue term (one warp instruction per 1024 multiply-adds), so an explicit gate is the only guarantee that defaults do not change. Step 9 records the numbers.

### What worked
- `node test/mma-kernel.mjs` → "MAP=mma: TF32/f16/bf16 products, batches, tails and fused epilogues simulate correctly; refusals are exact". The 512×256×384 TF32 kernel matched the reference with `maxAbs 0` under the sequential order.
- `npm test` → "all 51 passed"; `python3 -m pytest -q` → "177 passed, 7 subtests passed".

### What didn't work
- Tail test, first run: `TypeError: Cannot read properties of undefined (reading 'K')` at `kt.K.grid` — no `MAP=mma` kernel; the warning was `pins MAP=mma,BM=32,BN=16,BK=16 are not offered by schedule at n17`. The printed expression was `add_{r7<19} mul(round_tf32(in0[a1, r7]), round_tf32(in1[a0, r7]))`: fused rounding. Fixed by the operand-chain rule above.
- Tail test, second run: `f32 tails: every output written and right (512)`: my assertion expected `n === 561`, but `simulateKernel` caps the compared sample at 512 of the covered outputs. Fixed the assertion.
- Refusal test: `Cannot read properties of undefined (reading 'attrs')` — the 32×16×32 case also fused its rounding, so no tile kernel had a `tf32` input precision. I moved that case to 256×128×192.
- Operational mistake (no code effect): building the base-revision tree for the comparison, `ln -s …/node_modules $S/base/node_modules` succeeded silently (stderr discarded), so my next `ln -sfn $S/base/packages/evidence $S/base/node_modules/@kiln/evidence` rewrote the *worktree's* `node_modules/@kiln/evidence` symlink to point into the scratch copy. I noticed it in the `ls` output, restored `node_modules/@kiln/evidence -> ../../packages/evidence` (same form as the `kiln` link beside it), replaced the scratch symlink with a real directory, and re-ran both dumps. The full test run of this step happened before the mistake; the evidence package is byte-identical between the two trees.

### What I learned
- Whether rounding stays a separate kernel depends on size (the fusion work guard), so any legality rule must handle both forms; the guide's probe used one size.
- The pin mechanism (`core/kiln.js:999-1004`) ignores a pin where it is not offered and warns, which is exactly the right behaviour for `MAP=mma` pins on whole programs (rounding kernels keep their maps).

### What was tricky to build
- Keeping the fork tree's knob keys stable. Without the `undefined` level value, every existing option would gain `WM=0,WN=0`, `canonRow` would still print the same row (it drops off-values), and the only symptom would be evidence lookups silently returning nothing. The comparison dump includes `knobs=` JSON so this cannot regress unnoticed.
- The warp-collective contract: atoms are emitted outside every `if`; tails rely on zero fill of the shared tiles (A rows ≥ M, B columns ≥ N, and k ≥ K are zero), and only the epilogue is guarded.

### What warrants a second pair of eyes
- `mmaPlan`'s format-chain rule: `round_f16(round_tf32(x))` is classified by the outermost rounding (f16). Correct for values, but worth a reviewer's check.
- `matMma` with `WM=64, WN=64` holds 128 accumulators per lane; register pressure on hardware is unmeasured.
- Whether `__launch_bounds__(1024)` kernels with large warp tiles compile without spills (GPU-side check).

### What should be done in the future
- Phase 4 (Step 9): target rates and ranking tests.
- KILN-007 should build on `mmaWarpStep`/`mmaAccElements`; the accumulator layout differs from the A-fragment layout, so P·V after softmax needs either a shared-memory round trip or a register re-layout (a new helper in this section).

### Code review instructions
- tile.js `operandChain`, `mmaPlan`, `forkTree`, `launch`, `costPrior`; kernel.js section "warp-level tensor-core tiles" and `matMma`; core/kiln.js `expandFork`.
- `node packages/kiln/test/mma-kernel.mjs`; `cd packages/kiln && npm test`; the comparison: `node <scratch>/cmp/dump.mjs <kiln root>` for both trees, then `diff`.

### Technical details
- Cases in `test/mma-kernel.mjs`: TF32 linear+bias+relu 512×256×384 (CUDA has inline PTX, no packing; WGSL null with reason; four accumulation orders pass; a check with `K.mma` removed fails with "not representable in tf32"); three explicit knob sets (`64/64/16/32/32`, `32/64/8/16/64`, `128/16/32/64/8`); f16 and bf16 linear 64×48×40 (packing helpers, includes, `__float2half_rn`/`__float2bfloat16_rn` stores); batched matmul `[4,96,80]@[4,80,72]`; tails `M=33, K=19, N=17` for TF32 (fused rounding, `K.mma.a/b = null`, `kiln_round_tf32(` in the mma kernel) and f16; bias+GELU; scale+residual; refusals (FP32 highest, `matmul(..., "highest")` under tf32, mixed f16/bf16, WebGPU `sm 0`, `sm 70`, f32 precisions, `max` reduction, `mul(sub(a, c), b)`, a second multiply, `add(a, b)` body); default gb10 compile has no `mma` and no `WM`/`WN` keys.
- First pinned compile on GB10 (model-ranked knobs under the FP32-peak prior): `k_linear_ew_reduce MAP=mma,BM=128,BN=32,BK=16,WM=16,WN=8`, grid 48, block 1024, 12800 B shared memory; simulated 145 ms.

## Step 9: Phase 4 — the tensor-core cost model, and why defaults need an explicit gate

`estimateMma` (written in Step 8 so that the fork tree could be ranked at all) counts what `matMma` writes: tensor flops, global traffic of the tile loads, shared-memory wavefronts of padded tile stores and fragment reads, warp instructions for loads, atoms and packing, and the scalar epilogue. `timeModel` gains a `tensor` resource only when a kernel has tensor flops, so every existing estimate's `parts` object is unchanged. I compared the estimate with the instrumented simulator on a pinned 256×192×320 TF32 kernel: tensor flops and shared-memory wavefronts agree exactly, warp instructions within 0.4 %, traffic within 13 %. `test/mma-cost.mjs` pins those agreements and the ranking behaviour.

The guide's decision "use `peakTflops` as a pessimistic prior, then `MAP=mma` is never predicted faster" turned out to be false in this model: at equal compute rate, the 1024³ TF32 product is predicted at 86 µs on `mma` against 254 µs on `tiled` on GB10, because `tiled` is shared-memory bound and an atom needs 6 fragment loads per 1024 multiply-adds. The explicit gate in `costPrior` (Step 8) is therefore what keeps the default compile unchanged, not the prior.

### Prompt Context
**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Phase 4 of the guide: per-precision rates, estimate branch, tensor term, `regsEstimate`; tests that defaults are unchanged without rates and that ranking works with them.
**Inferred user intent:** The model must be able to choose tensor cores once the GB10 rates are measured, and must not do so before.
**Commit (code):** the commit following this entry — "KILN-006 Phase 4: tensor-core cost model and ranking tests".

### What I did
- targets.js: documented the optional `mma: { tf32, f16, bf16 }` field; no spec carries it (A100 datasheet figures recorded in the comment only).
- test/mma-cost.mjs (new): ranking with an A100-like test spec (`mma: {156, 312, 312}`): 1024³ TF32 → `mma` by `model`; 16³ → not `mma`; `SPECS.a100` and `SPECS.gb10` (no rates) → no `mma`; FP32 highest → no `mma`; an f16 1024×512×768 linear → `mma`; a `MAP=mma` pin on an unrated target → `pinned-partial`, "the rest by model". Counts: tensor flops and wavefronts equal the simulator's, warp instructions within 5 %, traffic within 25 %, `regs` formula for TF32 and f16, tensor part equal, `timeModel` uses the rate when given, `tiled` estimates have no `tensor` part, `predictedCost` equals the per-kernel sum and differs between pinned `mma` and pinned `tiled`, `estimate` of `MAP=mma` without a plan throws.
- Re-ran the Step 8 comparison dump: still `IDENTICAL` to the base revision.

### Why
- No real spec gets a rate: (1) GB10's are unmeasured (guide Open question 1); (2) giving A100/H100 datasheet rates would switch default compiles on those targets to kernels that have never been compiled by NVRTC, let alone run; (3) a new spec field changes `specHash(device.spec)` and with it the content ids of records simulated on that spec (records.js `contentOf`). A derived test spec exercises the ranking without any of these effects.

### What worked
- `node test/mma-cost.mjs` → "mma cost model: unchanged defaults without rates, ranking with rates, counts agree with the simulator". `npm test` → "all 52 passed"; pytest → "177 passed, 7 subtests passed".

### What didn't work
- No failures in this step. (The numbers that falsified the guide's prior assumption are in Technical details.)

### What I learned
- At equal FP32 peak, the model already prefers `mma` for large products because of the shared-memory term; the real speedup on hardware will come from both the tensor rate and the lower shared-memory traffic per multiply-add.
- The model's favourite warp tile at the peak prior is small (`WM=16, WN=8`); larger tiles reuse fragments better but cost registers and occupancy. Calibration on hardware decides.

### What was tricky to build
- Matching wavefront counts exactly required `estimateMma` to use the same padded strides (`mmaSmemLayout`) as `matMma`, and the same lane→address mapping for tile stores as the loader (`kFast` choice from the operand's coefficients).

### What warrants a second pair of eyes
- The `Infinity` gate in `costPrior` depends on `fork.options` being passed to cost functions (core/kiln.js `decide.cost` passes `fork: fp`). If evidence later measures an `mma` row, `decide.evidence` can still choose it, which is intended.
- Traffic is 13 % below the simulator on the test kernel; the epilogue traffic approximation (`numelOut · 4 · (1 + epilogue loads)`) is the likely source.

### What should be done in the future
- Phase 0: measure GB10 dense TF32/f16/bf16 rates with FP32 accumulation; set `SPECS.gb10.mma` (this changes the gb10 spec hash, so do it together with a planned record refresh).
- Phase 5: recalibrate `estimateMma` from measured kernels (KILN-005 reference 47's method).

### Code review instructions
- tile.js `estimateMma`, `timeModel` (`raw.tensor`), `costPrior`; targets.js comment.
- `node packages/kiln/test/mma-cost.mjs`.

### Technical details
Per-mapping best estimates (µs), TF32 square matmul, scratch script `KILN-006-impl/try3.mjs`:

| target | n | tiled best | mma best (bound) | chosen by default |
|---|---|---|---|---|
| gb10 (no rate, FP32-peak prior) | 128 | 4.76 | 5.82 (dram) | tiled |
| gb10 (no rate, FP32-peak prior) | 1024 | 253.95 | 86.00 (tensor) | tiled (gate) |
| a100 + test rates | 128 | 5.93 | 3.73 (launch) | mma |
| a100 + test rates | 1024 | 243.98 | 42.44 (smem) | mma |

At n = 16 fusion inlines the TF32 rounding and the kernel is a `MAP=row` kernel.

Estimate vs simulator (`a100-tensor-test`, `MAP=mma,BM=64,BN=64,BK=16,WM=32,WN=32`, 256×192×320, all 20 blocks): tensorFlops 31457280 / 31457280; smemWavefronts 53760 / 53760; warpInstr 143360 / 143920; traffic 2293760 / 2621440; regs 72 / 72; us 9.30 / 10.21; check `max abs diff 0.00e+0`.
