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
