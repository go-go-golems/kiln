---
Title: Resident expert architecture review and direction
Ticket: KILN-005
Status: active
Topics:
    - kiln
    - passnet
    - compiler-optimization
DocType: reference
Intent: review
Owners: []
RelatedFiles:
    - Path: integrations/passnet/dispatch.py
      Note: Dispatch key and mutation copyback; needs output permutation for A1
    - Path: integrations/passnet/fx_import.py
      Note: Routing, storage and dtype contracts split across one 484-line function (findings A4, B1)
    - Path: integrations/passnet/generate_pass.py
      Note: |-
        Pattern identity keyed on output order; root cause of the 16 ordinary-band dispatch misses (finding A1)
        Pattern identity includes output order (A1)
    - Path: packages/kiln/src/std/export.js
      Note: Data constants always exported as f32 (A5)
    - Path: packages/kiln/src/std/tensor.js
      Note: |-
        contractFma ignores low-precision rounding; elementwiseDtype differs from PyTorch for 0-dim tensors (A3, A4)
        contractFma and elementwiseDtype findings (A3, A4)
    - Path: scripts/kiln-export.mjs
      Note: Artifact source record omits the internal-check bypass (A6)
ExternalSources: []
Summary: Independent review of the Kiln–PassNet integration at 73bc1fc with verified defects, structural recommendations, answers to the seven architecture questions and a focused execution direction
LastUpdated: 2026-10-31T18:30:00-04:00
WhatFor: Taking over the project; deciding what to fix, refactor and measure next
WhenToUse: Before changing the importer, pass generator, dispatch, typed IR or optimization-program layer
---

# Resident expert architecture review and direction

## 1. Verdict

The Kiln–PassNet integration has a sound spine. Source FX graphs are traced, exported to a typed JSON schema, translated into a Kiln project script, compiled through six IRs into a `kiln-program/1` artifact, and executed inside the original PassBench harness through a generated pass that calls the compiled CUDA. Each stage has a single owner and a narrow data contract. The evidence discipline is strong: frozen plans, source hashes, original numerical checker, and explicit labels for protocol modifications.

The project's main risk is not a missing feature. Measured results are piling up faster than the shared contracts that would let them compound. Three examples:

1. One frozen band lost 16 graphs (two otherwise complete families) because two independently correct components disagree about the order of a pattern's outputs.
2. The importer holds every operator's routing, argument binding, storage semantics and dtype checks in one function. No step checks that Kiln's inferred dtype equals PyTorch's. I reproduced one silent dtype mismatch in this review.
3. The optimization-policy grammar can only see four work-model numbers. The fixed-policy negative transfer result (task 25 against tasks 83 and 101) is what that representation predicts, and adding agent search on top of it will not change that.

I recommend the following direction. **Stop widening operator coverage for one short cycle. Fix the four shared-contract defects below, put the importer behind a byte-identical census gate, and then run the typed-value wave and the first real optimization experiment in parallel.** Section 7 gives the concrete plan with stopping rules.

## 2. Scope, revision and what was run

The review covers commit `73bc1fc29bf3e0a76609ae215fbbf25e2bd5108b` on `research/passnet`. I read the end-to-end path in the order the handoff guide (reference 43) recommends: `corpus.py`, `fx_trace.py`, `fx_export.py`, `fx_import.py` with its `fx_*` helpers, `generate_pass.py`, `dispatch.py`, `runtime.py`, `scripts/kiln-export.mjs`, `std/export.js`, `std/emmy.js`, `std/tensor.js`, `std/loop.js`, `std/fusion.js`, `std/emit.js`, and the policy layer (`transformation_program.mjs`, `fusion_policy.mjs`). I also read the pinned upstream replacement code in `sources/upstream/pass_bench/torch/custom_replacement.py` and `backend/pass_mgr_direct.py`.

| Check | Command | Result |
|---|---|---|
| Kiln package tests | `node scripts/run-node-tests.mjs packages/kiln/test` (Node 26.13.0) | all 41 passed |
| Integration tests | `python3 -m unittest discover -s integrations/passnet -p 'test_*.py'` (torch 2.11.0+cu130, local) | 155 run, **1 failure**: `test_fx_trace.MutationTraceTests.test_input_mutation_and_alias_observer_rejected` (finding A2) |
| f16 contraction probe | `kiln-export.mjs` on `a*b+c` with three `f16[64]` inputs, `--contraction allow` and `separate` | allow: internal check FAILED; with `--no-check` emits `fmaf(in0,in1,in2)` with one f16 rounding. separate: `__fmul_rn`, f16 round, `__fadd_rn` (finding A3) |
| 0-dim promotion probe | import + export `x_f16[2,3] * s_f32[]` | PyTorch result `float16`; Kiln artifact output `f32`; no diagnostic (finding A4) |
| Remote GPU state | `ssh bling tmux ls; nvidia-smi` | `kiln-uniform-importable-v1`, `kiln-breadth-replays-v1`, `kiln-input-mutation-wave-v1` sessions exist; GPU at 0 % when sampled; 15 stale `passnet-*` sessions from 2026-10-30 still open |

I launched no GPU jobs and changed no code. The remote observation is one sample, so it says nothing about whether a band is terminal. Read the terminal `run.json` files to establish that.

## 3. Category (a): concrete correctness or reproducibility defects

### A1. Pattern identity depends on output order; PassBench's does not

**Evidence.** `generate_pass.extract_pattern` (`integrations/passnet/generate_pass.py:57-71`) builds the deduplication key from every traced node, including the `output` node's argument tuple. Two source models that compute the same subgraph but return `(a, b)` and `(b, a)` get different keys, so they become different `KilnPatternNNNN` modules (lines 82-84). Each manifest variant gets `specialization=[identity]` for its own pattern (line 90). `CorpusDispatch` keys programs on `(input descriptor, specialization)` (`dispatch.py:37-38, 61-64`).

PassBench applies rules in `sorted_output_pass_rule_names.json` order. `generate_pass.py:109` sorts only by argument count, so equal-arity rules keep identity order. The matcher is created with `match_output=False` (`custom_replacement.py:81-86`), so a pattern that returns `(a, b)` matches a graph that returns `(b, a)`. The replacement's outputs are then zipped with `match.returning_nodes`, which are in the **applied pattern's** return order (`custom_replacement.py:132-162`). The applied rule therefore passes its own identity, which has no compiled program for this graph's shapes. That is exactly the 16-graph failure in reference 44 (task 6 `3→9`, `4→10`; task 24 `0→1`; task 185 `2→3`).

**Consequence.** A fallback that looks programs up by input metadata alone would run graph 9's program, which returns outputs in graph 9's order, under pattern 3's order. That produces silently swapped outputs. Diary step 236 already warned against this fallback, and the upstream code confirms the warning.

**Fix (owner `generate_pass.py`, then `dispatch.py`).** Make the pattern class invariant under output permutation, and carry the permutation per variant:

```python
# generate_pass.extract_pattern: split the key
body_key   = key_without_output_node            # computation only
returns    = [indexes[n] for n in output_args]  # node indices in this source's return order

# generate_pass.generate
cls = classes.setdefault(body_key, {'identity': len(patterns), 'returns': returns, 'text': text, ...})
# permutation from the class representative's return order to this variant's program outputs
perm = [returns.index(r) for r in cls['returns']]   # raises if the returned multisets differ
record['specialization'] = [cls['identity']]
record['output_permutation'] = perm

# dispatch.CorpusDispatch.__call__ (or the generated kiln_generated wrapper)
flat = program(*inputs)                  # this graph's own output order
ordered = [flat_outputs[p] for p in perm] # the representative pattern's order
```

Only the representative of each class is written as a rule, so the applied identity always equals the compiled identity. Two checks are required. First, assert that the returned node multisets are equal, not just the bodies. Second, keep the current "conflicting programs share a dispatch key" check, extended to compare `output_permutation`. `restore_outputs` operates on the structure tree, so apply the permutation to the flat `outN` keys before that call.

**Migration boundary.** Frozen corpora refuse regeneration (`generate_pass.py:76-77`), so in-flight bands are unaffected. Validate on fresh copies of tasks 6, 24 and 185 and replay them through the original checker. Tasks 6 and 24 have no other nominal failures, so this fix is expected, though not yet shown, to complete two more families.

### A2. A stale test now fails on the intended input-mutation behavior

`test_fx_trace.py:19-31` expects both `Input` (`x += y; return x`) and `Alias` to raise `fresh single-use`. Commit `5df0172` intentionally accepts the single-use input mutation (design reference 40). I verified that `Input` now imports with `output_structure={'input_alias': 0}` and `input_mutations=[{'input_index': 0, 'output': '__mut0'}]`, while `Alias` is still rejected. Split the test: assert the accepted structure for `Input` and the rejection for `Alias`, and add a `ReadAfter` case (`z = x*2; x += y; return x, z`), which the importer currently and correctly rejects. A suite with a permanently red test hides the next real regression.

### A3. Default FMA contraction removes source-visible low-precision rounding

`contractFma` (`packages/kiln/src/std/tensor.js:404-410`) rewrites `add(mul(a,b),c)` into one `fma` without looking at dtype. For f16 or bf16 each `tensor.ew` carries its own rounding (`liftEw` appends `round_f16`), so contraction drops the intermediate `round_f16(a*b)` that PyTorch eager performs. The probe shows `v0 = fmaf(in0, in1, in2)` followed by one f16 rounding. The default `contraction` is `allow` (`emmy.js:195`, `kiln-export.mjs:13`).

Kiln's internal end-to-end check catches the mismatch (the probe reports `FAILED`). The frozen qualification bands used `--contraction separate`, so **their evidence is not affected**. The defect is latent in this combination: default contraction plus `--skip-internal-reference-check` (`corpus.py:160`), which some exploratory runs used. Fix it in the rule. Add `e.type.dtype === "f32" && m.type.dtype === "f32"` to the `where` clause. FP32 contraction then remains an explicit, measured policy, and low-precision rounding is never contracted silently.

### A4. No node-level check that Kiln's type equals PyTorch's type

`import_graph` validates output metadata in some branches (activations, scalar ops, layout, pooling), but not in `binary`, `unary`, `torch.conv2d`, `torch.cat`, batch norm or the reductions. The only uniform post-check is that the FX result dtype is floating (`fx_import.py:448-449`). Kiln infers types with its own rules. `elementwiseDtype` (`tensor.js:161-165`) treats only splat constants as weak scalars, but PyTorch also lets a 0-dim tensor defer to a dimensioned operand of the same category. The probe `x_f16[2,3] * s_f32[]` imports and compiles cleanly. It yields an f32 artifact output where PyTorch yields f16, and nothing raises. The internal check cannot detect this, because it compares Kiln against Kiln.

**Fix (owner: importer, with a small Kiln frontend addition).** Every FX node already carries `tensor_meta`. Emit a checked binding for every generated value:

```javascript
// proposed: nn.expect is an identity op whose infer() throws on mismatch
const v2 = N.expect(N.mul(v0, v1), [2, 3], "f16");
```

`nn.expect` decomposes to nothing in `decomposition`, so generated code is unchanged. The export fails with a named `TypeError` that cites the FX node. That turns a whole class of silent semantic drift into an import diagnostic. It also gives the census a new, honest failure category ("Kiln type rule differs from PyTorch"). Fix `elementwiseDtype` separately, using the PyTorch category rule: dimensioned tensors dominate 0-dim tensors, and 0-dim tensors dominate Python scalars within a category.

### A5. Data constants are always exported as f32

`exportProgram` (`packages/kiln/src/std/export.js:151-153`) writes every `tensor.const` with data as `Float32Array.from(...)` and dtype `"f32"`. Two consequences follow. A BigInt-backed `i64` constant, now possible after the typed-reference-storage checkpoint, throws `TypeError: Cannot convert a BigInt value to a number`. An f16 constant becomes an f32 buffer, while the kernel's declared input type comes from the graph. The PassNet importer rejects `get_attr` today (`fx_export.py:59-60`), so no current artifact is affected. The capability-waves plan (reference 42, Q1) schedules captured tensor constants, so this sits directly on the next wave's path. Export `data.dtype` with exact little-endian bytes for each storage type, and add a test per dtype.

### A6. Artifacts do not record that the internal reference check was skipped

`kiln-export.mjs:93-95` stores `contraction` and the optimization-program hash in `program.source`, but not `--no-check`. An artifact compiled with the bypass is byte-identical in metadata to a checked one. Run manifests record the flag, but the artifact is what travels into PassBench task directories and raw evidence tarballs. Add `internal_check: "skipped" | "ok at <level>"` to `source`. This is a one-line change and is backward compatible for readers.

### A7. Latent 32-bit index arithmetic

`toCuda` declares `const int tid`, `const int bid`, `int` loop variables and `int` index registers (`emit.js:36-39, 51`). No exporter or scheduler check refuses buffers with 2³¹ or more elements, or grids whose `grid * block * COARSEN` would overflow the flattened index. This review did not measure the largest PassBench tensor, so the finding is latent. Add an exporter guard that raises `ExportError` when any buffer's `elements` or a kernel's flattened extent exceeds `2**31 - 1`. That is cheaper than discovering the bug as a numerical failure in the large band.

## 4. Category (b): structural problems that grow with coverage

### B1. The importer has no single authority per operation

`import_graph` (`fx_import.py:15-484`) contains roughly 30 `elif` branches. The properties of each operation are spread across at least four places:

| Property | Where it lives today |
|---|---|
| Spellings (function, method, `aten` overload) | branch conditions plus `FUNCTIONS`/`METHODS`/`TARGETS` sets in seven modules |
| Argument binding | `bind()` in `fx_layout.py:13-19`, re-implemented inline about ten times in `fx_import.py` (lines 161-165, 183-187, 218-223, 246-251, 262-267, 369-373, 388-394, 424) |
| Result storage (fresh / alias) | one 3-line boolean at `fx_import.py:459-461` that re-lists the routing table |
| dtype names | `dtype_names` plus identical `DTYPES` dicts in `fx_scalar_ops`, `fx_linalg`, `fx_norm_ops`, `runtime.py`, and the `names` dict in `dispatch.py:60` |

Line 459 is the fragile part. A new lowering that is added to the router but forgotten in that line fails safe, because in-place ops on its result are rejected. A view-like lowering that is accidentally added there fails unsafe, because a mutation through an alias would be accepted. Operand resolution is also a reverse search by generated variable name (`next(key for key,val in values.items() if val==value)`), which appears seven times.

**Proposal.** Introduce one registry module, `integrations/passnet/fx_ops.py`, with a small and explicit contract:

```python
@dataclass(frozen=True)
class OpSpec:
    name: str                       # 'leaky_relu'
    functions: frozenset[str]       # {'torch.nn.functional.leaky_relu'}
    methods: frozenset[str]         # set() — call_method spellings
    signature: tuple[str, ...]      # ('input', 'negative_slope', 'inplace'); aten uses 'self'
    storage: Literal['fresh', 'alias']
    lower: Callable[[Bound, Ctx], Lowered]

@dataclass(frozen=True)
class Lowered:
    expr: str | list[str]
    mutates: str | None = None      # bound field whose source is mutated in place
```

`Ctx` owns `resolve(value) -> TensorMeta`, `literal()`, the dtype table and the FX node metadata. `import_graph` keeps its sequential walk, but each branch becomes `spec = REGISTRY.lookup(kind, target)`, `bound = bind(spec, args, kwargs)`, `lowered = spec.lower(bound, ctx)`, followed by the shared postconditions: the A4 type check, `storage` updating `fresh`, and `mutates` going through `require_mutation_source`. Lowerings that need source-specific handling keep it in their own `lower` function. The registry declares *what* an operation is, not *how* it is computed. That avoids the "unreviewable registry of overloads" the handoff warned about.

**Migration gate.** Every manifest variant already records `source_sha256` of the generated script. Before porting, capture the full current import census as `{graph: sha256(script) | error}`. Every porting step must reproduce it byte for byte, and only A4 may introduce new, intended differences. That makes the refactor reviewable as "no behavior change" and leaves frozen experiments untouched.

### B2. Typed values: extend the Loop IR, do not add a parallel layer (question 1)

A separate typed scalar layer between tensor and loop IR would need its own fusion, scheduling, work estimation and emission. It would become the second GPU compiler that design 21 rightly wants to avoid. The existing `E` expression grammar is small (four node kinds, `loop.js:49-60`). A typed extension touches a finite list of places:

| Place | Current float assumption | Required change |
|---|---|---|
| `E.num` (`loop.js:50`) | `+v` coerces to a double | carry `{v, dtype}`; BigInt for `i64` |
| `E.op` constant folding (`loop.js:53`) | `Math.fround` | fold per dtype or refuse to fold integers |
| `compileSerial`/`compilePoint` (`loop.js:217-275`) | `FLOAT32_FUNCTIONS`, `Math.fround` literals | typed function table and typed arrays per input |
| `KB` registers (`kernel.js`) | `K.floats` and `K.ints` (indices only) | typed value registers |
| `toCuda` (`emit.js:23-38`) | `float` temporaries, loads widen to float | typed temporaries, `int64_t`/`bool` storage |
| `exportProgram` constants | f32 only (A5) | exact bytes per dtype |
| `runtime.DTYPES`, `dispatch` names, importer `dtype_names` | float plus `u8` | one shared dtype table (B1) |

For data-dependent indexing, add one new expression kind instead of a new op per source operator: an indirect load `{k: "in", i, idx}` in which an index entry may be an integer-typed `E` (for example another load) rather than an affine `IX` term. `inlineInto` and `substE` already substitute coordinates through `idx`. They must also recurse into such entries, and `free()` must collect their variables. Legality stays local, because an indirect load cannot be lowered to the `tiled` map. `legalMaps` would exclude it, in the same way it already restricts maps by analysis. Bounds behavior becomes an explicit attribute (`clamp | assume | trap`) on the load, decided at the FX boundary from PyTorch's semantics.

### B3. Effects belong at the program boundary, and that should stay a rule (question 3)

The guarded mutation design is sound for its scope because the Kiln program stays purely functional. Mutations surface as hidden outputs `__mutN`, and `CorpusDispatch` copies them back after the whole program has run on the current stream (`dispatch.py:67-72`). Fusion therefore cannot cross an effect: no effect exists inside the program. Keep that as an invariant for Q4. Multi-use inputs and views should be handled by **functionalization at the importer** (version numbers per storage, rejected when an observer reads after a write through an alias). Effects should not become IR operations.

Two smaller points. The `__mutN` naming convention is a contract shared by `fx_import.py:477-479` and the manifest, and it should be an explicit `effects` list in the manifest schema. Also, `TorchProgram.__call__` returns the input tensor object itself when an output buffer equals an input buffer (`runtime.py:39-41`). That matches PyTorch identity for pass-through outputs, but it should be covered by a test, because it interacts with copyback whenever an output and a mutation target share storage.

### B4. Reference and external semantics need a declared policy (question 4)

The internal check compares Kiln's compiled kernels against Kiln's own reference interpretation. It catches lowering bugs (A3 is an example) but not frontend semantic drift (A4). The external checker catches drift but reports only a tolerance curve per graph. I recommend the following policy:

1. The internal check is mandatory for transformations that change arithmetic order or rounding: contraction, reduction re-association and any future precision policy. It may be skipped only for documented reference limitations (convolution accumulation, design 19). Each skip must then be recorded in the artifact (A6).
2. The A4 type postcondition is mandatory everywhere and is not skippable.
3. Source tolerance lives only in the external checker. Kiln never loosens its own comparison to match a PassBench tolerance.

### B5. The optimization representation cannot express the decisions that matter (question 5)

`fusion_policy.mjs` decision trees see `originalWork`, `fusedWork`, `consumerCount` and `producerElements`, plus three per-consumer additions. All of these come from `workOf`, a trip-count-weighted operation count with a fixed `W_MEM = 12` (`loop.js:183-196`). The tree cannot ask whether a kernel contains a reduction, what its producer operation is, what its dtype width is, how much it broadcasts, or which target it runs on. The fixed-policy study measured exactly this blindness: the same program changed six executables in task 25 (0.33× latency) and six in task 101 (32.8×). No threshold on those four features separates them, so agent search over that grammar cannot either.

Before running further agent comparisons:

1. **Calibrate the cost model.** Record GPU-only kernel time for every accepted artifact (the evidence already exists in raw tarballs) and fit `workOf` weights per target. Report rank correlation between predicted and measured cost. If it is poor, no policy over `workOf` features can be good.
2. **Add stable structural features**: `hasReduction`, producer and consumer operation class, bytes (dtype-aware) instead of elements, broadcast factor, and the selected tile map. These features keep their meaning across shapes and hardware.
3. **Add a GB10 target spec** to `targets.js`. Scheduling with an A100 proxy while running on GB10 confounds every scheduling result (question 7).

### B6. Orchestration has outgrown per-milestone scripts (question 6)

The ticket has more than 650 numbered scripts, and `integrations/passnet` has 19 `check_*_cuda.py` drivers. The frozen-band workflow (plan → stage → run → collect → audit → summarize) has stabilized, so it should become one CLI with one run-manifest schema, for example `passbench_run.py {freeze,stage,launch,collect,audit}`. The existing scripts 615–619 and 655–657 are its specification. Keep raw receipts and tarballs. Retire only the code paths, after the CLI reproduces the ordinary-band audit bit for bit from its tarball.

## 5. Category (c): optional cleanups

- Close the 15 stale `passnet-*` tmux sessions on bling. They make "which session owns the GPU" harder to answer.
- Replace the seven reverse lookups in `fx_import.py` with a `var → node` map (this falls out of B1).
- `INTERN.clear()` at 400,000 entries (`loop.js:21`) can split hash-consing in the middle of a compile. It is harmless for correctness but can duplicate work. Scope the table per pipeline run.
- `freeze()` in `generate_pass.py:63` maps `True` and `1` to the same key. This is harmless today, but make it explicit by keying bools separately.
- `tensor.record_stream(stream)` on inputs (`runtime.py:34`) is unnecessary when the launch uses the current stream. It is harmless.
- `N.mean` and the importer's mean multiply by the reciprocal of the count, while PyTorch divides the sum. This is within 1 ulp, but it is worth recording among the numerical-failure hypotheses for the 43 nominal misses.
- `relu` maps NaN to 0 in both the reference (`a > 0 ? a : 0`) and CUDA (`fmaxf(x, 0.0f)`) (`std/fns.js:42`), while PyTorch propagates NaN. Kiln is internally consistent here, and random benchmark inputs rarely produce NaN. `fx_scalar_ops.py` already uses `select` to keep NaN for clamp. Use the same form for relu if a NaN-producing family appears.

## 6. Answers to the seven review questions

1. **Typed values.** Extend `E` with per-node dtype and an indirect-load index term (B2). Do not create a second layer.
2. **Importer structure.** Use the `OpSpec` registry with shared binding and postconditions, gated by a byte-identical import census (B1).
3. **Effects and aliasing.** The current guarded model is sound because effects exist only at the program boundary. Keep functionalization in the importer and make effects an explicit manifest list (B3).
4. **Reference versus external semantics.** The internal check is mandatory for arithmetic-order transformations, every skip is recorded in the artifact, and the type postcondition is mandatory (A3, A4, A6, B4).
5. **Optimization representation.** The grammar is expressive enough to be safe but too blind to be useful. Calibrate `workOf` against measurements and add structural features before more agent search (B5).
6. **Benchmark boundary.** The protocol labels are right. Fix A1 at the pattern-identity boundary, and consolidate orchestration into one CLI (B6).
7. **Runtime and target.** Add a GB10 spec. Separate GPU-only from end-to-end timing for every result; per-call Python dispatch (dict lookup, output and scratch allocation, copyback) dominates short kernels.

## 7. Direction: the plan I would execute

The project has two success measures, and both are already defined in reference 42. **Breadth** is the number of complete externally accepted tasks out of 200 on *one* frozen snapshot. **Generalization** is the held-out score gain of a reusable compiler strategy at a fixed budget. The plan below advances both without starting new parallel threads.

| Phase | Work | Exit criterion |
|---|---|---|
| P0 (days) | A1 pattern classes plus permutation; A2 test; A3 dtype guard; A6 artifact record; A7 guard; close stale sessions | Python and Node suites green; tasks 6, 24, 185 replayed through the original checker on fresh copies |
| P1 | Diagnose task 79 (no match) and task 128 (dead-code pattern) at the matcher boundary; classify the 43 nominal numerical failures by operation and dtype from the existing failure summary | Each of the 24 incomplete ordinary families has a named cause |
| P2 | B1 registry refactor plus A4 `nn.expect` postcondition, gated by the census hash | Byte-identical census except for intended A4 diagnostics |
| P3a (coverage) | Typed wave Q1 through `E`-level types (B2), A5 constant export | First typed families accepted under the original checker |
| P3b (research, in parallel) | Calibrate `workOf` on GPU-only timings; add structural features and a GB10 spec; freeze a train/held-out split over accepted families; compare baseline, hand policy and agent policy at equal budget | One held-out result, positive or negative, with a frozen protocol |

Stopping rules:

- Do not combine counts from different snapshots in any headline number.
- Do not count a single-graph speedup as a compiler result.
- If P3b shows that `workOf` does not rank measured costs, stop policy search and fix the cost model first.
- If P0 does not complete tasks 6 and 24, investigate why before starting P2. The diagnosis would then be wrong, and the cause must be found.

The "decent project" deliverable at the end of P3 is a two-number result on one frozen revision: accepted families out of 200, and held-out score change for the best reusable strategy compared with unchanged Kiln. Each number gets its full failure accounting.

## 8. References

- Handoff guide: [reference 43](43-resident-expert-architecture-and-code-review-guide.md); ordinary-band result: [reference 44](44-uniform-ordinary-band-passbench-result.md); fixed-policy result: [reference 35](35-fixed-transformation-program-passbench-result.md); waves: [reference 42](42-capability-waves-for-coverage-and-optimization-breadth.md); mutation design: [reference 40](40-input-mutation-functionalization-design.md); typed design: [design 21](../design-doc/21-typed-values-and-data-dependent-indexing.md).
- Intern system guide written alongside this review: [design 22](../design-doc/22-kiln-passnet-system-guide-for-new-interns.md).
- Upstream replacement semantics: `sources/upstream/pass_bench/torch/custom_replacement.py` (lines 81-86, 132-162) and `sources/upstream/pass_bench/torch/backend/pass_mgr_direct.py` (lines 177-225, 369-378).
- Probe inputs live in the session scratchpad. To reproduce them, write the three-line `f16` multiply-add script and the `x_f16 * s_f32[]` module shown above and run `scripts/kiln-export.mjs --target a100` with and without `--no-check`.
