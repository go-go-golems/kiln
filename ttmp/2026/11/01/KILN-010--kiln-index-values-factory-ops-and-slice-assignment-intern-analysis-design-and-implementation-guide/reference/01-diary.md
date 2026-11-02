---
Title: Diary
Ticket: KILN-010
Status: active
Topics:
    - kiln
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/fx_compose.py
      Note: lower_sdpa causal refusal examined in Step 5
    - Path: repo://integrations/passnet/test_fx_factories.py
      Note: importer factory/setitem tests (Step 8)
    - Path: repo://packages/kiln/test/index-values.mjs
      Note: Kiln index-value tests (Steps 6-8)
    - Path: repo://ttmp/2026/11/01/KILN-010--kiln-index-values-factory-ops-and-slice-assignment-intern-analysis-design-and-implementation-guide/scripts/04-factory-preserving-trace.py
      Note: Prototype factory-preserving tracer referenced by diary Step 4
    - Path: repo://ttmp/2026/11/01/KILN-010--kiln-index-values-factory-ops-and-slice-assignment-intern-analysis-design-and-implementation-guide/sources/census-regression-v1.json
      Note: full census regression (1931 -> 1961, 0 regressions)
    - Path: repo://ttmp/2026/11/01/KILN-010--kiln-index-values-factory-ops-and-slice-assignment-intern-analysis-design-and-implementation-guide/sources/import-census-v1.json
      Note: 20-record census and PyTorch reference comparison
ExternalSources: []
Summary: Chronological investigation diary for the KILN-010 index-value, factory-op and slice-assignment design guide.
LastUpdated: 2026-11-01T07:32:05.70977214-05:00
WhatFor: Records how the KILN-010 design guide was researched, what evidence it rests on and what remains open.
WhenToUse: Read before implementing KILN-010 or reviewing its design guide.
---

# Diary

## Goal

This diary records the research behind the KILN-010 design guide: an index-value expression node for Kiln's Loop IR, factory operations (arange, meshgrid, zeros/full) and functional slice assignment, with argmax and causal masks as consumers. Each step follows the investigation format.

## Step 1: Orientation in the compiler core (IX, Loop IR, Tensor IR, Kernel IR, emitters)

The first phase read the skill instructions and then the six source files that every part of this design touches: the index algebra, the Loop IR, the Tensor/nn dialects, the scalar-function table, the Kernel IR materializer and the emitters. The goal was to find out whether an "index value" (an integer computed from loop coordinates and used as data) already exists anywhere, and where each pipeline stage would have to learn about one.

The result is that it does not exist as a first-class value. Coordinates appear only inside index expressions (load addresses, `iset` statements, `if` conditions), never as an operand of a scalar function. The cumsum decomposition shows the existing workaround: it turns the comparison `i - j < 0` into a 0/1 index into a two-element data table `[1, 0]`, so the comparison becomes data through a load.

### Prompt Context

**User prompt (verbatim):** "Create new docmgr tickets for tensor-core matrix products  and fused attention and cumsum and writing mutated inputs (one docmgr + design doc per task). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

The user then added this item with "also" and the pasted list: "1. An index-value node plus factory ops: arange, meshgrid, zeros/full and slice assignment (x[..., 0] = y). One design unlocks several things: the BEiT relative-position families (the 17 get_attr graphs); causal attention (is_causal=True, as a triangular mask); max(dim)[1]/argmax, as a reduction over (value, index); a simpler cumsum mask. 2. Integer floor division and modulo." This ticket (KILN-010) covers item 1. The user also asked: "and can we build them with CPU only".

**Assistant interpretation:** Write one intern-facing analysis/design/implementation guide for item 1 in ticket KILN-010, plus this diary, with docmgr bookkeeping. The parent agent handles the reMarkable upload.

**Inferred user intent:** Have an implementable, evidence-backed plan for a single IR extension that unblocks four separate corpus gaps, and know which parts can be built and validated without the GPU host.

**Commit (code):** none (documentation only; no commits by instruction).

### What I did

- Read `/home/manuel/.claude/skills/ticket-research-docmgr-remarkable/SKILL.md` with `references/writing-style.md` and `references/deliverable-checklist.md`, `/home/manuel/.claude/skills/textbook-authoring/SKILL.md`, `/home/manuel/.claude/skills/docmgr/SKILL.md`, `/home/manuel/.claude/skills/diary/SKILL.md` and `references/investigation-entry.md`.
- Inspected the ticket skeleton (`index.md`, `tasks.md`, empty `design/` and `reference/`).
- Read with `nl -ba`: `packages/kiln/src/core/ix.js` (315 lines), `packages/kiln/src/std/loop.js` (425), `packages/kiln/src/std/tensor.js` (618), `packages/kiln/src/std/fns.js` (122), `packages/kiln/src/std/kernel.js` (388), `packages/kiln/src/std/emit.js` (333).
- Created this diary with `docmgr doc add --ticket KILN-010 --doc-type reference --title "Diary"`.

### Why

- Every stage that walks Loop IR expressions (`akey`, `free`, `substE`, `walkE`, `printE`, `schedule`, `inlineInto`, `compileSerial`, `compilePoint`, `emitNest`, `valueTypes`, the three emitters) must handle a new expression kind, so the list of those switch statements is the core of the implementation plan.

### What worked

- `E` in `loop.js:50-64` has exactly four kinds (`num`, `in`, `op`, `red`); every consumer switches on `x.k`, so the touch points are enumerable by grep.
- `IX.subst` (`ix.js:151-158`) and `IX.remapLoads` (`ix.js:168`) already handle the substitutions that fusion and scheduling perform on index expressions; an `E.ix` node holding an `Ix` can reuse them unchanged.
- The Kernel IR already has integer variables (`KB.int`, `kernel.js:25`, statement `iset`) and spells them in CUDA (`emit.js:75`), WGSL (`emit.js:153`) and the simulator (`emit.js:206`).

### What didn't work

- `docmgr doc add` for the design doc did not return within the 120 s tool timeout and was moved to the background; the diary `doc add` immediately before it completed. Recovery: wait for the background job and check the `design/` directory before writing.

### What I learned

- Kernel IR float expressions are `{k:"num"|"var"|"op"}` only (`kernel.js:8,17`); there is no expression that reads an integer variable as a value. The index-value lowering therefore needs either a new kernel expression kind or a `let` bound through a conversion function.
- `valueTypes` (`kernel.js:258-303`) assigns static types to every named temporary; an index value would be typed `i32` or `i64` there.
- The WGSL emitter refuses every non-f32 output and every typed integer function (`emit.js:94-116`, `fns.js:77` sets `w: null`), so integer index values will be CUDA/simulator-only at first.

### What was tricky to build

- Nothing built yet. The subtle point found so far is that fusion renames reduction variables (`loop.js:340-350`, fresh `r` per reduction) and rewrites coordinates `a0…` by substitution. An index value that mentions `a1` or a reduction variable `r7` must be rewritten by the same substitution, or it silently refers to the wrong loop after fusion.

### What warrants a second pair of eyes

- Hash-consing: `akey` (`loop.js:25-38`) normalizes bound reduction variables to de Bruijn names for `in` nodes. A new `ix` kind must apply the same normalization, or two α-equivalent reductions over an index value stop being shared.

### What should be done in the future

- Continue with the importer and corpus evidence (get_attr cause, setitem, causal SDPA, argmax).

### Code review instructions

- Start at `packages/kiln/src/std/loop.js:50-90` (`E`, `substE`, `walkE`, `printE`) and `packages/kiln/src/core/ix.js:151-168`.

### Technical details

- Existing cumsum mask: `tensor.js:524-533`, `T.view(tensor.const({data: [1, 0]}), wide, (c) => [c[a].sub(c.at(-1)).lt(0)])`.

## Step 2: Why the 17 graphs contain get_attr, and what Dynamo sees instead

This phase located the 17 blocked graphs in the KILN-005 census and determined experimentally why their exported FX contains a `get_attr` node. The source `model.py` files contain no constants: they call `torch.arange`, `torch.functional.meshgrid`, `torch.zeros`, slice assignment and in-place arithmetic. The `get_attr` is produced by Kiln's own tracer, and it disappears when the same module is captured by TorchDynamo, which is how the PassBench evaluator's `torch.compile` backend receives graphs.

That changes the shape of the design. The blocker is not missing constant support alone; it is that symbolic tracing evaluates every input-independent subcomputation eagerly in Python and stores the result as a tensor attribute. The factory operations exist in the graphs PassBench matches, so a Kiln lowering of the factory operations is both possible and the faithful representation.

### Prompt Context

**User prompt (verbatim):** see Step 1. During this step the coordinator relayed a new user instruction: "tell each agent to use their own diary and to folow the diary format as they go". From this step on, the diary is written after each research phase rather than at the end.

**Assistant interpretation:** Keep this ticket's own diary, in investigation format, updated after each phase.

**Inferred user intent:** Preserve reasoning and failures as they happen, so the record is trustworthy and reviewable.

**Commit (code):** none.

### What I did

- Parsed `ttmp/2026/10/30/KILN-005--.../sources/views-ops-import-v1.json` (format `kiln-passnet-import-audit/1`, 200 tasks observed, 2060 records: 1931 imported, 129 blocked) and listed the records whose error mentions `get_attr`.
- Found 17 graphs in 3 families (3 distinct `sample` hashes), all failing with `_tensor_constant0: unsupported FX node kind get_attr; decompose or export constants explicitly`:
  - BEiT relative-position index (sample `ac39…`, 6 graphs): `microsoft_beit-large-patch16-512_start1541_end1570_29` (bf16, f16, f32), `microsoft_beit-base-patch16-384_start23_end52_2` (f32, f16), `AkshatSurolia_BEiT-FaceMask-Finetuned_start13_end42_2` (bf16).
  - ConViT positional tensor (sample `035b…`, 6 graphs): `convit_small_start6_end25_1`, `convit_tiny_start6_end25_1` across dtypes.
  - MPNet relative-position buckets (sample `f126…`, 5 graphs): `all-mpnet-base-v2_start11_end39_2`, `microsoft_mpnet-base_start11_end39_2`, `hf-tiny-model-private_tiny-random-MPNetForSequenceClassification_start11_end39_2`.
- Read the three float32 `model.py` files under `sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/9/samples/...`.
- Wrote and ran `scripts/01-trace-get-attr.py` (traces with `integrations/passnet/fx_trace.py` `trace_module`, prints each `get_attr`, its tensor and users).
- Wrote and ran `scripts/02-dynamo-capture-factories.py` (captures the same modules with `torch.compile(..., backend=recorder, fullgraph=True)` on CPU, prints call targets and `get_attr` nodes).
- Read `integrations/passnet/fx_export.py:49-72`, `corpus.py:43-82`, `fx_import.py:205-300` and `575-740`, `fx_compose.py:126-149`, `fx_normalize.py:95-105`.

### Why

- The design must say whether the 17 graphs need index values at all. If the constant were inherent in the source, a data-constant path would be the whole answer.

### What worked

- `01-trace-get-attr.py` output (torch 2.11.0+cu130, CPU):

```text
== microsoft_beit-base-patch16-384_start23_end52_2 nodes: 5
  get_attr _tensor_constant0 (332929,) torch.int64 users: ['output:output']
    first values [2211, 2209, 2209, 2209, 2209, 2209, 2209, 2209] min 0 max 2211
== convit_tiny_start6_end25_1 nodes: 6
  get_attr _tensor_constant0 (1, 196, 196, 3) torch.float32 users: ['output:output']
== all-mpnet-base-v2_start11_end39_2 nodes: 13
  get_attr _tensor_constant0 (7, 7) torch.int64 users: ['output:output']
```

- In every family the constant is a graph output used by nothing else: the entire factory subcomputation was folded.
- `02-dynamo-capture-factories.py` output: zero `get_attr` nodes, and the factory operations survive as nodes:

```text
beit:   cat 1, arange 2, meshgrid 1, getitem 7, stack 1, flatten 1, sub 1, permute 1, contiguous 1, iadd 2, setitem 7, imul 1, zeros 1, sum 1, view 1
convit: layer_norm 1, zeros 1, arange 2, view 2, sub 1, repeat 1, repeat_interleave 2, pow 2, add 1, unsqueeze 3, setitem 3
mpnet:  embedding 2, add 3, layer_norm 1, dropout 1, arange 2, getitem 2, sub 1, neg 1, lt 2, to 2, mul 2, abs 1, float 1, truediv 2, log 1, full_like 1, min 1, where 1, iadd 1
```

### What didn't work

- No failure in the experiments. One expectation was wrong: the census does not contain any graph blocked by `is_causal=True` or by argmax indices. The blocked reasons in this census are (count, families): no NVIDIA driver 59/14, get_attr 17/3, `tensor_split` 9/1, ShapeProp errors 16, fresh-unaliased in-place 5/2, `float: inf` 4/1, `builtins.getattr` 3/1, `new_zeros` 3/1, MHA forward 3/1, others ≤2. Causal attention and argmax therefore have code evidence (refusals in `fx_compose.py:132-134` and `fx_import.py:241,270`) but no counted graphs in this census.

### What I learned

- `torch.fx.Tracer` calls `torch.arange(24)` with concrete Python integers, so it returns a real tensor; all later operations on it are also concrete; when the result reaches the output, `create_arg` stores it as `_tensor_constant0` and emits `get_attr`. Nothing about the source graph is constant-only; the tracer made it so.
- The importer is fed by `corpus.translate_graph` (`corpus.py:57`, `trace_module`), while PassBench's evaluator and the KILN-005 `scripts/658-simulate-pattern-dispatch-identity.py` matcher simulation see Dynamo graphs. The two disagree for exactly these families.
- In BEiT, `tmp_13 = tmp_12[:, :, 0]; tmp_13 += 23` mutates `tmp_12` through a view before the explicit setitem writes the same values back. Correct import must treat in-place arithmetic on a view as a write into the view's root.
- The constants are large: reference 37 in KILN-005 records 49 to 1,050,625 elements; BEiT-base is 577² = 332,929 int64 values (2.66 MB).

### What was tricky to build

- Reading the Dynamo node list correctly: `setitem` appears 7 times in BEiT (four region writes plus the three view write-backs), and `getitem` 7 times (meshgrid unpacking plus views). The design has to lower `operator.setitem` with a tensor or scalar value, onto a root that is itself a view-chain base.

### What warrants a second pair of eyes

- PassBench rule patterns are generated from `model.py` and traced by `fx_normalize.trace_pattern` (`torch.fx.Tracer`, symbolic). If symbolic tracing folds the factory region in the pattern too, the pattern holds a `get_attr` while the Dynamo target holds `arange` nodes, and the rule cannot match. This is a PassBench-matching question outside KILN-010's compiler scope, but it decides whether these 17 graphs can ever be claimed.

### What should be done in the future

- Run the 658 matcher simulation on these three families once a factory-preserving pattern tracer exists.

### Code review instructions

- Re-run: `python3 ttmp/2026/11/01/KILN-010--.../scripts/01-trace-get-attr.py $PWD` and `.../02-dynamo-capture-factories.py $PWD` from the worktree root.

### Technical details

- Export refusal: `integrations/passnet/fx_export.py:59-60`. Tracer: `integrations/passnet/fx_trace.py:25-31`. Graph walk refusal of other kinds: `fx_import.py:689-690`.
- Data constants export as FP32 only: `packages/kiln/src/std/export.js:68-70` (`Float32Array.from(src.attrs.data.data)`), so an int64 data constant cannot be exported today.

## Step 3: The folded constants are closed-form coordinate expressions

This phase tested the central design hypothesis: that the BEiT and ConViT factory outputs are functions of their output coordinates alone, writable in Kiln's IX algebra (`+`, `*`, floor `/`, `%`, comparisons) plus a select. If true, the whole BEiT relative-position table becomes one kernel with zero loads, and its correctness can be checked on CPU against eager PyTorch.

Both closed forms matched eager PyTorch exactly on the first run. MPNet is different: it applies `log` to a float conversion of `|i - j|`, so its index values feed ordinary typed scalar functions rather than staying inside the IX algebra. That family needs index values plus `abs` over int64 and `full_like`, but no new reduction.

### Prompt Context

**User prompt (verbatim):** see Step 1 (and the diary instruction recorded in Step 2).

**Assistant interpretation:** Establish, with an executable check, which parts of the blocked graphs an index-value node expresses directly.

**Inferred user intent:** A design grounded in a verified example rather than an assumed one.

**Commit (code):** none.

### What I did

- Wrote and ran `scripts/03-closed-forms.py`, which evaluates BEiT-base-384 and ConViT-tiny `model.py` eagerly on CPU and compares with closed forms.
- BEiT closed form, with `W = 24`, `N = 577`, `p, q` in `[0, N)`, `i = p - 1`, `j = q - 1`:

```text
inner(p, q) = ((i / W - j / W) + (W - 1)) * (2W - 1) + ((i % W - j % W) + (W - 1))
out(p, q)   = p == 0 && q == 0 ? 2211 : q == 0 ? 2210 : p == 0 ? 2209 : inner(p, q)
```

- ConViT closed form, `a, b` in `[0, 196)`, grid 14: `dx = b % 14 - a % 14`, `dy = b / 14 - a / 14`, `out[0, a, b, :] = (dx, dy, dx² + dy²)` as float32.
- Read the importer registry (`fx_import.py` decorators at lines 52-571) to list what the three families still lack.

### Why

- An index value is only worth a new IR node if the target computations reduce to it. This experiment is the cheapest proof.

### What worked

```text
beit  equal: True torch.int64 (332929,)
convit equal: True torch.float32 (1, 196, 196, 3)
```

- In BEiT, `p - 1` is negative only on row/column 0, where the select discards `inner`; for the selected elements every dividend is nonnegative, so C truncation and floor agree. This matters because `IX.emit` spells `/` as plain C division unless the dividend has a data-dependent term (`ix.js:269`).

### What didn't work

- No failures. A first draft of the ConViT form had the channel order unverified (`repeat` versus `repeat_interleave`); the check confirmed channel 0 is the `repeat` term (`b % 14 - a % 14`).

### What I learned

- Importer coverage missing for these families: `torch.arange`, `torch.zeros`, `torch.functional.meshgrid`, `full_like`, `operator.setitem`, `repeat`, `repeat_interleave`, `abs` over int64 and `square`/`pow` over int64 (`fns.js:72-80` defines only add, sub, mul, neg, max, min for integers).
- `contiguous` is registered `fresh=False` (`fx_import.py:428`), so BEiT's `tmp_12 = tmp_11.contiguous()` is treated as an alias and any later write to `tmp_12` would be refused by `require_mutation_source` (`fx_import.py:640-646`). A `contiguous()` of a non-row-major source copies in PyTorch; the importer can see that from `tensor_meta.strides`.

### What was tricky to build

- The select in the closed form evaluates both branches. On a GPU, the `inner` branch is pure arithmetic, so evaluating it out of the selected region is harmless. A slice assignment whose value is a tensor `y`, however, reads `y` at a coordinate derived from the output coordinate; outside the region that coordinate is out of range. The design must clamp the read index, because Kiln's selects are not branches.

### What warrants a second pair of eyes

- Kernel index arithmetic is 32-bit (`export.js:13`, `INT32_INDEX_LIMIT`). The BEiT values are small, but an index value of dtype int64 computed in 32-bit arithmetic is only exact when its interval fits; `IX.interval` (`ix.js:189-216`) can check that statically.

### What should be done in the future

- Repeat the closed-form check for BEiT-large-512 (1025 × 1025) when implementing, because its constants differ (W = 32).

### Code review instructions

- Run `python3 ttmp/2026/11/01/KILN-010--.../scripts/03-closed-forms.py $PWD`.

### Technical details

- MPNet bucket computation (from `model.py`): `rel = j - i` over 7 × 7; `n = -rel`; `ret = (n < 0) * 16`; `m = |n|`; `large = 8 + to_i64(log(m / 8) / 2.7726 * 8)` clamped by `min(large, 15)`; `ret += where(m < 8, m, large)`.

## Step 4: A factory-preserving symbolic trace (prototype) and the remaining compiler touch points

This phase checked whether the importer can see the factory operations without switching to Dynamo. A prototype tracer in the ticket's `scripts/` directory temporarily replaces `torch.arange`, `torch.zeros`, `torch.ones`, `torch.full` and `torch.functional.meshgrid` with wrappers that emit `call_function` nodes, and adds a `__setitem__` to the proxy. The exported graphs have zero `get_attr` nodes and the same node counts as the Dynamo captures (32 for BEiT, 23 for ConViT).

The same phase finished the inventory of compiler sites that switch on Loop IR expression kinds, and found three latent bugs that the design must fix before integer factories work: two folding rules drop a splat's dtype, and the row-map tree combine shares one shared-memory array across reductions of different dtypes.

### Prompt Context

**User prompt (verbatim):** see Step 1 (and Step 2 for the diary instruction).

**Assistant interpretation:** Determine the smallest importer change that exposes factory operations, and every compiler site an index-value node touches.

**Inferred user intent:** A phased plan whose first slice is small and whose risks are named.

**Commit (code):** none. The prototype lives only in `scripts/04-factory-preserving-trace.py`; `integrations/passnet/fx_trace.py` is unchanged.

### What I did

- First run of `scripts/04-factory-preserving-trace.py` failed (below); added `SetitemProxy.__setitem__` and `FactoryTracer.proxy` in the script and reran.
- Grepped every expression-kind switch: `loop.js:28-35` (`akey`), `43-46` (`free`), `66-75` (`substE`), `83-90` (`printE`), `113` and `130-147` (`schedule`), `178` (`printNest`), `195` (`workOf`), `225` and `255` (`compileSerial`, `compilePoint`), `340-350` (`inlineInto`); `tile.js:83-94` (contraction detection), `212-240` (estimate), `298` (`printTile`); `kernel.js:49-67` (`emitNest`), `258-303` (`valueTypes`), `332` (`printKernelBody`); `emit.js:41-47`, `100-105`, `124`, `183` (expression spellings).
- Read `tensor.js:563-576` (optimization rules) and `kernel.js:106-120` (`treeCombine`).

### Why

- An index-value node is useful only if the importer can produce it from the blocked graphs; the trace prototype decides between a tracer change and a Dynamo-based importer.

### What worked

```text
== microsoft_beit-base-patch16-384_start23_end52_2 get_attr: 0 nodes: 32
   ['_operator.getitem', '_operator.iadd', '_operator.imul', '_operator.setitem', '_operator.sub', 'contiguous', 'permute', 'sum', 'torch.arange', 'torch.cat', 'torch.flatten', 'torch.functional.meshgrid', 'torch.stack', 'torch.zeros', 'view']
   setitem example meta: None args: {'tuple': [{'ref': 'contiguous'}, {'tuple': [{'slice': [None, None, None]}, {'slice': [None, None, None]}, 0]}, {'ref': 'iadd'}]}
== convit_tiny_start6_end25_1 get_attr: 0 nodes: 23
   ['_operator.add', '_operator.pow', '_operator.setitem', '_operator.sub', 'repeat', 'repeat_interleave', 'torch.arange', 'torch.nn.functional.layer_norm', 'torch.zeros', 'unsqueeze', 'view']
```

### What didn't work

- First prototype run:

```text
  File ".../microsoft_beit-base-patch16-384_start23_end52_2/model.py", line 31, in forward
    tmp_12[slice(None, None, None), slice(None, None, None), 0] = tmp_14
TypeError: 'MutationProxy' object does not support item assignment
```

  `torch.fx.Proxy` defines no `__setitem__`. Before the factory patch this line ran on a concrete tensor, which is why the existing importer never saw it. Recovery: a proxy subclass whose `__setitem__` records `operator.setitem`.

### What I learned

- An `operator.setitem` node has `tensor_meta` `None` (it returns `None`); the importer's walk rejects a node without dict metadata (`fx_import.py:705-706`), so setitem needs a lowering that binds the result under the target's metadata.
- `foldSplatView` (`tensor.js:568-570`) and `foldSplatEw` (`tensor.js:574-576`) rebuild `tensor.const({ value, shape })` without `dtype`, so a view of `zeros(dtype=int64)` becomes an f32 splat. `N.const` (`tensor.js:465`) also lacks a dtype parameter.
- `treeCombine` (`kernel.js:106-120`) uses one shared array `s_red` for every row reduction in a kernel; `valueTypes` (`kernel.js:290-293`) refuses an array that holds two dtypes. A two-pass argmax (f32 max, then i64 min over indices) in `MAP=row` would therefore be refused at materialization.
- The tiled contraction test (`tile.js:86-87`) lists node kinds `in`, `op`, `red`; a hoisted `ix` value read inside a contraction body would slip past it and fail later with `MaterializeError`. The list must include the new kind.
- `schedule` names nodes `in…`, `v…`, else `acc…` (`loop.js:134`) and emits every non-`in`, non-`op` node as a reduction (`loop.js:143-147`); an `ix` node would be mis-emitted as a reduction unless both sites learn the kind.

### What was tricky to build

- The prototype must restore the patched torch attributes in a `finally`, because the patch is process-global; a failed trace would otherwise leave `torch.arange` returning proxies for the rest of the process, including ShapeProp's later real execution.

### What warrants a second pair of eyes

- The tracer patch covers names looked up as attributes at call time (`torch.arange(...)`). A model that binds `from torch import arange` at import time keeps the original and still folds. The upstream `model.py` files use attribute calls, but the importer should still refuse a `get_attr` explicitly, as it does now.

### What should be done in the future

- Move the prototype into `integrations/passnet/fx_trace.py` in Phase 3 with tests; keep the explicit `get_attr` refusal.

### Code review instructions

- Run `python3 ttmp/2026/11/01/KILN-010--.../scripts/04-factory-preserving-trace.py $PWD`.

### Technical details

- Exported target spellings to register: `torch.arange`, `torch.zeros`, `torch.ones`, `torch.full`, `torch.functional.meshgrid` (also `torch.meshgrid`), `_operator.setitem`, methods `repeat`, `repeat_interleave`, `full_like`, `new_zeros`.

## Step 5: Writing the design guide, probing PyTorch semantics, and bookkeeping

This phase wrote the design guide, checked two PyTorch semantics the design depends on with a CPU probe, corrected one claim about the simulator found while verifying, and did the docmgr bookkeeping. The probe confirmed both formulas: the NaN-aware argmax key reproduces `torch.max(x, -1).indices` and `torch.argmax`, and `select(j <= i, s, -inf)` reproduces `is_causal=True` SDPA for `L < S`, `L == S` and `L > S`.

Verification of the guide against the code found that the SIMT simulator is float-only: integer-typed temporaries are removed from `K.floats` and never declared in `toSim`. The guide originally said integer index values could be simulated after a small array-type change; it now states that simulator integer support is a Phase 1 deliverable and that, until then, integer outputs are checked by the Loop IR reference.

### Prompt Context

**User prompt (verbatim):** see Step 1. The coordinator relayed two process instructions during this step: keep drafts only in a ticket-specific scratchpad subdirectory and re-read the design doc end to end before finishing.

**Assistant interpretation:** Deliver the design doc and diary with docmgr hygiene; do not upload; keep drafts isolated.

**Inferred user intent:** A reviewable intern guide whose claims are checked against the code.

**Commit (code):** none (no commits by instruction).

### What I did

- Wrote `design-doc/01-index-values-factory-ops-and-slice-assignment-analysis-design-and-implementation-guide.md` in the writing-style order (summary, scope, orientation, current state, gaps, architecture/APIs, decision records, pseudocode/flows, phases, tests, risks/open questions, references).
- Wrote and ran `scripts/05-argmax-and-causal-probe.py`.
- Read `packages/kiln/src/std/program.js:60-110` (`simulateKernel`) and re-checked `kernel.js:322` and `emit.js:264-270`.
- Related 7 files to the design doc and 2 to this diary with `docmgr doc relate --doc … --file-note "/abs/path:reason"`.
- Re-read the full design doc after the coordinator's scratchpad warning; it contains only KILN-010 material. I had written no files into the shared scratchpad (the only command that would have, a mermaid render, was denied before running); `scratchpad/kiln010/` was created for any future drafts.

### Why

- The argmax key and the causal mask were stated as PyTorch-equivalent; a probe is cheaper than a wrong design.

### What worked

```text
torch.max indices : [1, 0, 2, 0]
torch.argmax      : [1, 0, 2, 0]
design key        : [1, 0, 2, 0]
causal L=3 S=5 max|diff| = 8.940696716308594e-08
causal L=4 S=4 max|diff| = 3.5762786865234375e-07
causal L=5 S=3 max|diff| = 2.682209014892578e-07
```

The probe rows were `[1, 3, 3, 0]` (tie), `[nan, 2, nan, 5]` (leading NaN), `[5, 2, nan, 5]` (NaN after an earlier maximum) and `[2, 2, 2, 2]`.

### What didn't work

- My first design-doc `docmgr doc add` call exceeded the 120 s tool timeout and moved to the background; it had in fact created `design-doc/01-…md`. I looked in `design/` (empty), concluded it had failed, and ran `doc add` again, which created a duplicate `design-doc/02-…md` in 37 s. I deleted the duplicate with `rm` before writing.
- A Python string-replacement script for the design doc aborted on an assertion (`AssertionError: (first NaN if any, else f…`) because one target string spanned a column-aligned line I had mistyped; nothing was written, and the rerun with the exact substring succeeded.
- Rendering the two mermaid diagrams with `npx -y @mermaid-js/mermaid-cli` was denied by the permission classifier ("Code from External"). The diagrams were reviewed by eye only; they use plain `flowchart LR` and `sequenceDiagram` syntax without semicolons in messages.

### What I learned

- `simulateKernel` writes into a `Float32Array` (`program.js:93`) and `toSim` declares only `K.floats` (`emit.js:266`); integer kernels have never been simulator-checked. This makes Phase 1's simulator work a prerequisite for the "CPU-only" claim at the Kernel IR level.
- docmgr places design docs under `design-doc/`, not the skeleton's `design/` directory.

### What was tricky to build

- Keeping the CPU-only answer honest: design, references, CUDA source generation, tracing and matcher simulation are CPU-only now; Kernel IR simulation of integer outputs becomes CPU-only only after Phase 1; NVRTC and PassBench never are.

### What warrants a second pair of eyes

- Decision "Preserve factory calls in the symbolic tracer": it depends on open question Q1 (whether PassBench patterns, traced by plain `torch.fx.Tracer` in `fx_normalize.trace_pattern`, would contain the same factory nodes as the Dynamo target).
- The proposed `IX.emit` extent argument changes a core spelling function used for every address; the default must preserve current output byte-for-byte for addresses, or canonical-emission evidence changes.

### What should be done in the future

- Implement Phases 0-5 on CPU; run Phase 6 on the GPU host; resolve Q1 with the 658 simulation.

### Code review instructions

- Read the design doc Sections 3 and 6 first, then check the tables in 6.1/6.2 against `loop.js` and `kernel.js`.
- Re-run all five ticket scripts from the worktree root.
- `docmgr doctor --ticket KILN-010 --stale-after 30`.

### Technical details

- Ticket scripts: `scripts/01-trace-get-attr.py`, `02-dynamo-capture-factories.py`, `03-closed-forms.py`, `04-factory-preserving-trace.py`, `05-argmax-and-causal-probe.py`.

## Step 6: Implementation phases 0-2 — typed splats, E.ix through every stage, integer simulation, tensor.ixval and factories

This step starts the implementation in the worktree `worktrees/kiln-010-index-values` (branch `impl/kiln-010-index-values`). It implements the design guide's Phases 0, 1 and 2 in one pass, because each phase is only testable end to end through the next: an `E.ix` without `tensor.ixval` has no frontend producer, and an integer index tensor cannot be checked by the simulator until the simulator holds integers. The outcome is that `x + arange(4)` compiles to one kernel with one load, integer-output kernels simulate and compare exactly, and the cumsum and concat lowerings no longer carry data tables.

All 49 Kiln test files (48 existing plus the new `test/index-values.mjs`) and 177 PassNet tests pass. One existing assertion changed by design (the int64 tree-combine array is now `s_red_i64`).

### Prompt Context

**User prompt (verbatim):** "then, can we work on them in parallel (in separate worktrees maybe?)" and "tell each agent to use their own diary and to folow the diary format as they go, and to write a full report for the go-go-parc vault once they are done ( write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). )"

**Assistant interpretation:** The coordinator relayed these user instructions with the ticket assignment: implement KILN-010's CPU-buildable phases in a dedicated worktree, own the SIMT simulator's integer support and the shared `s_red` array, keep this diary as I go in the investigation format, and finish with a textbook-style vault note pushed to go-go-parc. GPU jobs are not mine to run.

**Inferred user intent:** Several tickets progress in parallel without stepping on each other, each with a reviewable record and a durable write-up.

**Commit (code):** 50f9c3a — "KILN-010: index values (E.ix, tensor.ixval), arange/full factories, integer SIMT simulation, per-dtype s_red"

### What I did

- Phase 0 (`packages/kiln/src/std/tensor.js`): `N.const(v, shape, dtype)`, `N.full/zeros/ones`; `foldSplatView` keeps the source dtype; `foldSplatEw` keeps the result dtype and folds typed integer functions exactly (i64 operands as BigInt; the fold is skipped when the result is not a safe integer).
- Phase 1, Loop IR (`loop.js`): `E.ix(e, dtype)` with dtype and predicate checks; cases in `akey` (bound variables renamed like `in`), `free`, `substE`, `printE`, `schedule` (named `x0…`, emitted as `{s:"let", e:{k:"ix"}}`), `printNest`, `workOf` (weight 1), `compileSerial`/`compilePoint` (`ixValue`: signed spelling, `BigInt(...)` for i64), `inlineInto` (`E.ix(remapIdx(IX.subst(x.e, ren)))`). `checkIxRange` refuses any subexpression whose interval leaves int32, and an unbounded (data-dependent) term inside arithmetic.
- Phase 1, IX (`core/ix.js`): `emit(e, lang, name, load, signed)`. With `signed`, a dividend whose interval (all variables nonnegative) may be negative is spelled with floor semantics; without it the output is byte-identical to before.
- Phase 1, Kernel IR (`kernel.js`): `kx.ix`, an `emitNest` branch substituting `ctx.env`, `valueTypes` returning the dtype, printer case; `treeCombine` names its array `s_red` for f32 and `s_red_<dtype>` otherwise.
- Phase 1, tile (`tile.js`): an `ix` node in a contraction body or hoisted into one disqualifies `MAP=tiled`; Tile IR printer case.
- Phase 1, emitters (`emit.js`): CUDA `((long long)(…))`, `((int)(…))`, `((…) != 0)`; WGSL refusal "WGSL index values not implemented"; simulator rewritten for integer values (below).
- Phase 1, program (`program.js`): `simInputs` (typed integer inputs; buffers read through `LD` hold 0/1), `outputStorage`, `checkExact`; `simulateKernel` compares integer outputs exactly against `compilePoint`.
- Phase 2 (`tensor.js`, `loop.js`, `concat.js`): `tensor.ixval`, `ixvalRef`, `fold_view_of_ixval` (in `optimization`), `lift_ixval`, and `liftEw` inlining an `ixval` operand as `E.ix` like a splat operand becomes `E.num`; `nn.arange` (integer arguments; float dtypes convert exact integers below 2^24), `nn.index_value`, `N.arange`, `N.indexValue`, `N.causalMask`; cumsum mask `j <= i` and concat mask `start <= c < start + width` as bool `ixval`; `nn.concat` accepts i64/i32/bool and `concatReference` allocates the input dtype.
- Test `packages/kiln/test/index-values.mjs`: α-equivalence, substitution, predicate/dtype checks, schedule names, int32 refusal; end to end: `x + arange`, an i64 zero-input kernel, negative-dividend floor/mod (CUDA spelling and simulator), index value inside a reduction under `MAP=thread` and `MAP=row`, int64 row reduction with `s_red_i64`, tiled epilogue, meshgrid-like views + integer concat folding to a zero-buffer kernel, cumsum with one input, typed zeros, causal mask.

### Why

- Inlining `ixval` at `liftEw` (rather than relying on fusion) makes the operand an index value even in pipelines that skip fusion, and gives the cost model one load instead of two from the start.
- Keeping `s_red` for f32 preserves every existing row kernel's CUDA source byte for byte; only integer combines get a new name.
- A separate `simInputs` keeps `kernelInputs` (shared with `devices.js` GPU runs and the workbench) unchanged for float buffers.

### What worked

- `node test/index-values.mjs` passed on its first full run after one test-only fix (below). Generated CUDA for the row case places `x0 = ((long long)(r0));` inside the strided reduction loop; the tiled case places `x0_0_0 = ((long long)(((16 * bn) + tx)));` in the epilogue; the floor case spells `((((-1)*(e%5)) + (e/5)) - (((… % 3) + 3) % 3)) / 3`.
- `npm test`: `all 49 passed`; `python3 -m pytest -q`: `177 passed, 7 subtests passed`.

### What didn't work

- `test/integer-arithmetic.mjs` failed: `AssertionError [ERR_ASSERTION]: an int64 tree combine stages int64 partial sums` — the CUDA now declares `__shared__ long long s_red_i64[32];`. This is the intended rename; the assertion now matches `s_red_i64`.
- My first test draft called `N.full(...)` outside `k.trace` and got `KilnError [ScopeError]: tensor.const(…) builds a node, so call it inside k.graph(…), k.trace(…) or a rule's rewrite`. Moved into a traced program.

### What I learned

- Before this step no integer kernel could run in the simulator at all: integer temporaries were dropped from `K.floats` and never declared, and inputs were always `Float32Array`. Gathers (`LD` terms) also had no simulator spelling for their data-dependent index. Both are fixed by the same change.
- `IX.emit(…, "js")` spells `%` as JS truncating `%` unless the dividend has a data-dependent term; index values need the signed flag in the JS reference too, not only in CUDA.

### What was tricky to build

- Int64 storage in the simulator: a `BigInt64Array` rejects number assignments (`TypeError: Cannot convert 3 to a BigInt`), and select branches or literals arrive as numbers. Every assignment whose destination is int64 storage (temporary, shared array, output) is wrapped in `B64(...)`; destination types come from `K.values`, `K.smem[].dtype` and the output parameter.
- The `signed` spelling must not change addresses: the flag is off for every existing caller, and the nonnegativity test uses `IX.interval` with every variable in `[0, 2^31)`, which is sound because every Kernel IR index variable (thread decode, loop variable, block index) is nonnegative.

### What warrants a second pair of eyes

- `checkIxRange` checks the Loop IR expression over loop extents; the kernel evaluates the *substituted* expression (thread decode), whose intermediate terms are bounded by the same ranges, but a reviewer should confirm no materializer introduces larger intermediates.
- `foldSplatEw` previously folded i64 functions through `F.js` on numbers, which for `add_i64` returned BigInt; it now converts operands explicitly and refuses unsafe results. KILN-011 owns the Loop IR `E.op` fold; this change is Tensor IR only.
- WGSL: cumsum and concat kernels now contain index values and are WGSL-unavailable (previously their table loads were WGSL-legal). No test asserted WGSL for them; the workbench browser path loses WGSL for those kernels until WGSL index values exist.

### What should be done in the future

- WGSL spelling of i32/bool index values (deferred design item).
- Phase 3 (assign, importer), Phase 4 (argmax), Phase 5 (causal) next.

### Code review instructions

- Start at `loop.js` `E.ix`, `checkIxRange`, `inlineInto` case `"ix"`; then `kernel.js` `emitNest`/`treeCombine`; `emit.js` `toSim` (`SIM_STORAGE`, `into`, `ldSim`, `ixValue`); `program.js` `simInputs`/`checkExact`.
- Validate: `cd packages/kiln && node test/index-values.mjs && npm test`.

### Technical details

- Kernel IR float-expression kinds are now `num | var | op | ix`; `ix` carries an `Ix` over kernel variables.
- Simulator storage: `{f32: Float32Array, i64: BigInt64Array, i32: Int32Array, bool: Uint8Array}` for temporaries, shared arrays and output.

## Step 7: Phases 4 and 5 — argmax over an index-valued key, causal attention

This step implements the two smallest consumers before the large importer phase, because both only need what Step 6 built. `nn.argmax` (with `fn: "max" | "min"`) decomposes to one `min_i64` reduction over the key of design §6.6; the importer now returns indices from `max/min(dim)` and lowers `torch.argmax/argmin`. `lower_sdpa` accepts `is_causal=True` by selecting with `N.causalMask(L, S)`. Both agree with eager PyTorch on CPU, including the NaN rows of `scripts/05`.

### Prompt Context

**User prompt (verbatim):** see Step 6.

**Assistant interpretation:** Continue the guide's phases in order of dependency.

**Inferred user intent:** Unblock argmax and causal SDPA graphs with the shared index-value machinery.

**Commit (code):** 24207fb — "KILN-010: argmax/argmin via an index-valued key, causal SDPA via N.causalMask"

### What I did

- `tensor.js`: `argRef` (first NaN, else first extreme), `nn.argmax` op, `N.argmax/N.argmin`, decomposition: `m = bc(reduce fn)`, `key = select(isnan, ix(r), select(eq, ix(r + n), 2n))`, `k = reduce min_i64`, `idx = select(k < n, k, k - n)`; integer inputs use the typed reducer and skip the NaN term.
- `fx_import.py`: `lower_max_min` returns `[values, N.arg{fn}(…)]`; new `argmax` op for `torch.argmax/argmin` and the methods, flattening when `dim` is absent; removed the now-unreachable "indices is not lowered" branch of `lower_getitem`.
- `fx_compose.py`: `is_causal` must be a static bool; with `attn_mask` it is refused (PyTorch rejects the pair); otherwise `scores = N.select(N.causalMask(L, S), scores, -Infinity)`.
- Tests: `index-values.mjs` argmax block (thread and row maps, both combine arrays in one row kernel, integer argmax); `test_fx_compose.py` `test_causal_attention` for (L, S) = (3, 5), (4, 4), (5, 3) and `test_argmax_indices_match_torch`; `test_fx_import.py` now expects `N.argmax(` instead of the refusal.

### Why

- The single-reduction key needs no pair reducer, and the MAP=row case is exactly the mixed-dtype combine the `s_red_i64` change of Step 6 enables.

### What worked

- `MAP=row` argmax kernels contain both `__shared__ float s_red[` and `__shared__ long long s_red_i64[` and simulate exactly.
- `pytest -q`: `179 passed, 7 subtests passed`; `npm test`: `all 49 passed`.

### What didn't work

- `test_argmax_indices_match_torch` failed first with `subprocess.CalledProcessError: Command '['node', '…/kiln_eval.mjs']' returned non-zero exit status 1.` Running the script by hand on random data worked; the NaN input case failed because Python's `json.dumps` writes `NaN`, which `JSON.parse` rejects. The test harness now sends NaN as `null` and `kiln_eval.mjs` maps `null` back to `NaN`.
- `torch.min(x, 0, keepdim=True).indices` would trace to a `getattr` node the importer does not lower; the test uses `[1]`.

### What I learned

- The importer's numeric harness had never carried a NaN input.

### What was tricky to build

- The key's `2n` sentinel and `n + r` offset must be computed in i64 from index values, not from a float `r`: an i64 `select` over `E.ix(r)` keeps every operand integer and the `valueTypes` check passes without conversions.

### What warrants a second pair of eyes

- Values output of `max(dim)` on NaN rows still follows Kiln's `max` reducer (open question Q2); only the indices are PyTorch-exact.

### What should be done in the future

- A pair reducer for single-pass argmax (deferred design).

### Code review instructions

- `tensor.js` `decompose("nn.argmax", …)`; `fx_compose.py` `lower_sdpa`; run `python3 -m pytest -q test_fx_compose.py test_fx_import.py`.

### Technical details

- `idx = k < n ? k : k - n` maps the key range `[0, n)` (NaN positions) and `[n, 2n)` (maxima) back to positions; `2n` never wins because every row has a maximum.

## Step 8: Phase 3 — slice assignment, factory-preserving tracing, importer lowerings, census

This step implements `nn.assign` and the importer work that makes the 17 `get_attr` graphs and the 3 `new_zeros` graphs import. The tracer now emits factory calls and `setitem` as nodes; the importer records basic-index views of fresh roots, lowers `setitem` and in-place arithmetic on such views to `N.assign` on the root, and re-derives every live view after each write. All 20 records import (ticket script 06), and for the float32 variants Kiln's frontend reference and the compiled Loop IR equal eager PyTorch exactly on every factory output (BEiT's 332,929- and 1,050,625-element tables, ConViT's `[1, 196, 196, 3]` table, MPNet's `[7, 7]` buckets, GAE's zeros). The BEiT table compiles to one zero-input CUDA kernel that the simulator checks exactly.

### Prompt Context

**User prompt (verbatim):** see Step 6.

**Assistant interpretation:** Implement Phase 3 and re-run the import census on the three families.

**Inferred user intent:** Turn the `get_attr` refusals into compiled programs, with evidence they compute PyTorch's values.

**Commit (code):** 5181a20 — "KILN-010: slice assignment, factory-preserving tracing and the importer lowerings for BEiT/ConViT/MPNet/GAE"

### What I did

- Kiln (`tensor.js`): `assignSpec`, `assignRef`, `nn.assign` (y broadcasts to the region, converts to x's dtype), decomposition `select(ixval(inRegion), view(bc(y), clamp), x)` with the region predicate built from `ge/le/mod` terms only where needed; `nn.repeat` (`c % d`) and `nn.repeat_interleave` (`c / r`) as views; `N.assign/N.repeat/N.repeatInterleave`.
- Kiln (`fns.js`): `abs_i64`, `abs_i32`; `to_i64`/`to_i32` saturate (NaN → 0) instead of throwing on non-finite inputs.
- Kiln (`loop.js`): `E.ix` of a constant within ±2^24 is `E.num` (substitution decides many region predicates).
- `fx_trace.py`: `MutationProxy.__setitem__`; `proxied_factories` patches `torch.arange/zeros/ones/full/meshgrid` and `torch.functional.meshgrid` for one `trace` call and restores them in `finally`.
- `fx_assign.py` (new): `View(root, entries, axes)`, `normalize`, `compose`, `region_shape`, `view_shape`, `assign_index`, `read_key`.
- `fx_import.py`: `Context.views/storage/record_view/owns/last_use`; `lower_getitem` records views; `lower_inplace_binary/method` return `view_write`; `write_region` and `lower_setitem` (a special case in the graph walk, since `setitem` has no metadata); `Lowered.fresh` override used by `contiguous` (fresh when the source strides are not row-major); factories `arange`, `zeros/ones/full`, `zeros_like/ones_like/full_like`, `new_zeros/new_ones/new_full`; `meshgrid` (`ij`, `xy`); `repeat`, `repeat_interleave`; `where`; `torch.abs`, `torch.log`; integer `sum` without the f32 round trip.
- `fx_scalar_ops.py`: integer `x ** 2` lowers to `N.mul(x, x)`; other integer exponents are refused by name.
- `corpus.py` `eliminate_dead_code`: `operator.setitem` counts as in-place, and the observability test walks up through view ops (`getitem`, `view`, `permute`, …) so a write through a view of a live value is kept.
- Tests: `index-values.mjs` (assign cases, repeat, integer abs, saturation) and `integrations/passnet/test_fx_factories.py` (7 tests: tracer nodes and patch restoration, factories/meshgrid/repeat numerics, setitem and in-place through views numerics, refusals through untracked aliases, contiguous alias, MPNet-style integer buckets).
- Ticket script `scripts/06-import-census-and-reference.py`; output `sources/import-census-v1.json`.

### Why

- Re-deriving views from the root after each write keeps the importer functional: no Kiln value is ever mutated, and a later read of a view sees the root's current value.
- Only views of fresh, unaliased roots are tracked; any other alias (a `permute`, a `view` of a tracked view) marks the root aliased, which refuses later writes — the same conservative rule the importer already applied to in-place calls.

### What worked

- Script 06: `20 / 20 imported`. Float32 references (max |Kiln − PyTorch|):

```text
beit-base-384   out0 f32 0.0 (exact)   out1 i64 [332929]  exact (frontend and loop)
beit-large-512  out0 f32 0.0 (exact)   out1 i64 [1050625] exact
convit_tiny     out0 f32 [1,196,196,3] exact   out1 (layer_norm) 9.5e-07 frontend / 3.3e-06 loop
convit_small    out0 exact                     out1 (layer_norm) 9.5e-07 / 5.7e-06
GAE             out0 i64 exact  out1 zeros exact  out2 exact
all-mpnet-base  out0 (layer_norm) 9.5e-07 / 2.4e-06   out1 i64 [7,7] exact
```

- Compiling the imported BEiT and ConViT scripts to GPU kernels and simulating them (scratch `simscript.mjs`): BEiT `k_out1 thread ins [] out i64 332929 sim true integer values equal`; ConViT `k_out0 thread ins [] out f32 1x196x196x3 sim true`.
- `npm test`: `all 49 passed`; `pytest -q`: `186 passed, 7 subtests passed`.

### What didn't work

- First BEiT import: `ValueError: sum_1: reduction requires a floating tensor, got torch.int64` — `lower_reduction` always cast to f32. Integer sums now stay int64.
- `TypeError: the JSON object must be str, bytes or bytearray, not int` in `lower_setitem`: I decoded the raw encoded argument instead of the decoded one.
- First census run: `14 / 20 imported`; all six ConViT variants blocked with `ValueError: pow: dtype-preserving floating tensor required` (`tmp_9 ** 2` on int64). Fixed by the integer-square lowering; second run 20/20.
- `test_write_through_untracked_alias_is_refused` failed with `AssertionError: ValueError not raised`: dead-code elimination erased `p[0] = 1` on `p = t.permute(1, 0)` because `p` had no later users, silently dropping a write. The DCE observability walk now follows view ops up to the root.
- A test-model typo produced `RuntimeError: The size of tensor a (6) must match the size of tensor b (4)` in eager PyTorch (my model, not Kiln); fixed the model.

### What I learned

- The `get_attr` refusal was hiding a second problem: the corpus DCE treats a write as observable only through the written node itself, so writes through views would have been dropped as soon as the factories were traced.
- MPNet's buckets evaluate `log(0) = -inf` and convert it to int64 in a branch `where` discards; the reference must not throw there (`BigInt(-Infinity)` is a `RangeError`).

### What was tricky to build

- The importer has two alias notions: in-place chains of one storage (`ctx.roots`, same shape, rebinding every name) and basic views (`ctx.views`, a region of the root, re-derived). Rebinding must skip views (they have another shape), and aliasing an untracked view must mark the *storage root* (`ctx.storage`) aliased, not the view name.
- `setitem` values: PyTorch broadcasts the value to the view's shape, which may contain inserted `None` axes that the assignment region does not have; `write_region` expands to the view shape and then reshapes to the region.

### What warrants a second pair of eyes

- `record_view` silently declines (no view recorded) for non-basic or unsupported indices; such a getitem then aliases its root like before. Confirm no write path relies on a view that was not recorded.
- The factory patch is process-global during tracing; a concurrently tracing thread would see the wrappers.
- The fused BEiT kernel carries redundant nested clamps (`min(max(min(max(…, 0), 575), 0), 575)`) and `(clamped / 576) % 2` terms that interval reasoning could fold. It is correct and has no loads; simplification is future work in `ix.js`.

### What should be done in the future

- Range-aware simplification of nested `min/max` clamps and of `/`, `%` by constants over clamped dividends.
- Q1: PassBench pattern tracing (`fx_normalize.trace_pattern`) must see the same factory nodes.

### Code review instructions

- Start at `integrations/passnet/fx_assign.py`, then `fx_import.py` `write_region`, `lower_setitem`, `Context.record_view`; `tensor.js` `decompose("nn.assign", …)`.
- Validate: `cd integrations/passnet && python3 -m pytest -q test_fx_factories.py`; `python3 <ticket>/scripts/06-import-census-and-reference.py $PWD <KILN-005 sources/upstream> out.json`.

### Technical details

- nn.assign index: one entry per axis, `{at: k}` or `{slice: [start, stop, step]}`; the decomposition clamps reads as `min(max(c - start, 0) / step, len - 1)`.
- Script 06 needs the KILN-005 upstream graphs, which are untracked; they live under the passnet worktree's `ttmp/2026/10/30/KILN-005-…/sources/upstream`.

## Step 9: Full census regression, bookkeeping, and the merge note for KILN-011

This step re-runs the whole KILN-005 views-ops import census (2060 graph records, fake metadata, CPU) against the frozen statuses, to check the design guide's corpus-level criterion: "no previously imported record regresses". It also records a reconciliation note the coordinator asked for.

### Prompt Context

**User prompt (verbatim):** see Step 6. Coordinator note during this step (relayed, not a user prompt): KILN-011 (branch `impl/kiln-011-floordiv-mod`, commit e1fad06, merging before this branch) already fixed `foldSplatView`/`foldSplatEw` dropping the dtype and exact i64 literals through folding; keep my change minimal and note it.

**Assistant interpretation:** Run the regression census, and document the overlap with KILN-011 for the merge.

**Inferred user intent:** A merge that does not silently fight over the same lines.

**Commit (code):** see the commit following this entry (evidence and docs only).

### What I did

- `scripts/07-full-census-regression.py` → `sources/census-regression-v1.json`.
- docmgr: checked Phase 0-5 tasks, added three follow-ups (GPU-host census of the driver-dependent records, range-aware IX simplification, WGSL index values), changelog entry, related files.

### What worked

```text
records 2060   imported before 1931   imported now 1961
blocked -> imported   30   (20 get_attr/new_zeros targets + 10 formerly "Found no NVIDIA driver")
imported -> blocked    0
blocked -> blocked with another error 36 (all formerly "Found no NVIDIA driver")
```

The 10 extra imports (GAE/RECT_L `start3_end6_1`, six `jhu-clsp_ettin-decoder-150m_start10_end12_3` variants, `openai_whisper-base_start0_end3_0`) previously failed because their factory calls with `device='cuda'` ran eagerly during symbolic tracing on this CPU-only machine; they are now nodes. Their numerics cannot be checked on CPU (the models allocate on CUDA).

### What didn't work

- N/A for this step; the 36 changed blockers (e.g. `ShapeProp error for: node=%le`, `to: device/layout conversion unsupported`, `fill_: unsupported tensor method fill_`, `triu: unsupported target torch.triu`) are still CPU-environment records and remain blocked.

### What I learned

- Factory-preserving tracing also moves device-dependent failures from trace time to ShapeProp time; the KILN-005 "no NVIDIA driver" bucket must be re-judged on the GPU host.

### What was tricky to build

- Comparing blockers across runs: the script compares the first 60 characters of each error, so a changed message counts as "other error" even when the cause is the same environment.

### What warrants a second pair of eyes

- **Merge with KILN-011:** this branch also changed `foldSplatView` (keeps `dtype`) and `foldSplatEw` (`splatFold`: i64 operands as BigInt, refuses unsafe results, keeps the result dtype) in `tensor.js`, in commit 50f9c3a. KILN-011 fixed the same two rules; at merge, keep one version (KILN-011's, if it covers the exact-int and dtype behavior) and drop the other. The `index-values.mjs` "typed splats keep their dtype" block checks the behavior either way. Related: my `E.ix` constant fold only folds constants within ±2^24 because literals go through f32 spellings in `compileSerial` (`Math.fround(o.num)`); if KILN-011's exact literal handling covers this, the bound can be lifted.

### What should be done in the future

- GPU host: re-run the census for the driver-dependent records; NVRTC and replays (see final report).

### Code review instructions

- `python3 <ticket>/scripts/07-full-census-regression.py $PWD <KILN-005 sources/upstream> out.json` (about 15 minutes on CPU).

### Technical details

- Output format `kiln-010-census-regression/1`: `records`, `imported_before`, `imported_now`, `changes` with the three lists.

## Step 10: Vault report (milestone)

Wrote the textbook-style deep-dive note `Projects/2026/11/01/ARTICLE - Kiln - Index Values, Factory Ops and Slice Assignment in a Functional Tensor Compiler.md` in the go-go-parc vault, committed only that file (vault commit f30be08) and pushed after `git pull --rebase` (an autostash of other agents' unstaged vault files was created and re-applied by git; nothing of theirs was committed). Prompt: see Step 6.
