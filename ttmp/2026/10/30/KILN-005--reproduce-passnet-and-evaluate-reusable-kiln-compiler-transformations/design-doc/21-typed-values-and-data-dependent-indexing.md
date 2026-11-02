---
Title: Typed values and data-dependent indexing across Kiln IR
Ticket: KILN-005
Status: active
Topics: [kiln, passnet, compiler-optimization]
DocType: design-doc
Intent: near-term
Owners: []
RelatedFiles: [packages/kiln/src/std/tensor.js, packages/kiln/src/std/loop.js, packages/kiln/src/std/emit.js, integrations/passnet/fx_import.py, integrations/passnet/runtime.py]
ExternalSources:
  - https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.embedding.html
  - https://docs.pytorch.org/docs/2.9/generated/torch.index_select.html
  - https://docs.pytorch.org/docs/2.9/generated/torch.cumsum.html
Summary: Cross-layer contract and batch sequence for exact integer and Boolean tensors, dynamic gathers, masks and scans
---

# Typed values and data-dependent indexing across Kiln IR

## Evidence and scope

The latest importer accepts1,668 of2,060 graphs and all variants of131 tasks. Typed placeholders are the first blocker for119 graphs in18 otherwise incomplete families. Script653 traced **all119 graphs without ShapeProp** and found four families containing `torch.nn.functional.embedding`, two containing `torch.cumsum`, one containing `index_select`, and others containing masks, integer division, casts, reductions, dropout and float computation. The per-family source operation inventory is `sources/typed-frontier-source-ops-v1.json`. It reveals later requirements but cannot establish that fixing typed inputs alone will complete18 tasks.

The audited compiler path currently rejects nonfloating FX placeholders (`integrations/passnet/fx_import.py`), uses FP32 scalar expressions in Loop IR (`packages/kiln/src/std/loop.js`), declares float temporaries and converts input loads to float in CUDA emission (`packages/kiln/src/std/emit.js`), and allocates only float/U8 PyTorch dtypes (`integrations/passnet/runtime.py`). The core storage-width table already lists `i32`, `i64` and `bool`; that table is not an executable typed-value contract. Converting an `int64` index through FP32 would lose exact identity for values above 2^24 and must not become the importer implementation.

The following is a proposed design, not an implemented API. The pinned official PyTorch2.9 pages are archived under `sources/pytorch-2-9-typed-index-docs-v1.tar.gz`, with hashes and source URLs in the matching receipt. PyTorch's embedding forward reads rows selected by integer indices; `index_select` takes a 1-D integer index and returns a new tensor; `cumsum` exposes an output dtype argument. The exact source call options and metadata of each benchmark family still govern which subcases we implement first.

## Required semantic distinctions

| Kind | Storage and scalar behavior | First uses |
|---|---|---|
| Floating tensor | Existing `f32`/`f16`/`bf16` behavior, including explicit rounding points | Embedding weights and downstream arithmetic |
| Integer tensor | `i64`/`i32` values remain integers through load, arithmetic, comparison and index generation; no float round trip | Token IDs, cumsum, shape-derived positions |
| Boolean tensor | Boolean storage/value semantics, explicit conversion to predicates and masks | `eq`, `ne`, `masked_fill` |
| Index coordinate | Bounds-checked integer offset into a tensor, derived from output coordinates and possibly loaded integer values | `embedding`, `index_select` |

The distinction between an **index expression** and an **integer tensor value** is important. Current `IX` expressions depend on static loop coordinates; `E.load(i, idx)` indexes an input with those expressions. An embedding row depends on the runtime contents of another tensor. Treating its row number as a compile-time index-map coordinate would be incorrect. The new primitive must represent a data-dependent read explicitly, with dependencies visible to scheduling, cost estimation and code generation.

## Proposed IR and lowering contract

At the tensor level, begin with a semantic gather primitive rather than teaching each frontend operation to emit CUDA:

```javascript
// Proposed conceptual interface; names may change during implementation.
T.gatherRows(weight, ids)                 // embedding; result shape ids.shape + weight.shape[1:]
T.indexSelect(source, axis, indices)     // 1-D indices; replaces source.shape[axis]
T.where(mask, onTrue, onFalse)           // mask selection with explicit dtype promotion
T.scanSum(source, axis, outputDtype)     // cumsum; ordered prefix operation
```

`gatherRows` and `indexSelect` can share a lower-level **indirect read** after their shape and axis semantics are established. For output coordinate `o`, compute `j = load_int(ids, index_coordinates(o))`; validate `0 <= j < extent` under the declared source contract; read `weight[j, feature_coordinates(o)]`. The index load and target load are separate dependencies in Loop IR. A type on every scalar load, operation and result is needed so CUDA can emit `int64_t` index registers and floating result registers without conversion through FP32. A typed `let` and typed buffer description are preferable to a second, benchmark-specific kernel emitter.

```text
FX typed placeholder / embedding / index_select / mask / cumsum
    → nn typed operation with shape, dtype and effect contract
    → tensor typed elementwise, indirect-read or scan primitive
    → Loop IR typed scalar dependencies and runtime index calculation
    → CUDA typed registers, loads, stores and bounds behavior
    → kiln-program artifact with exact storage bytes
    → PyTorch dispatcher with exact dtype and contiguous-storage checks
```

The reference evaluator must use exact integer storage (`BigInt64Array` or an equivalent exact representation for `i64`) where it executes integer operations. `Tensor` currently assumes float data, so extending only the CUDA emitter would leave the compiler's reference and transformation checking unsound. Constant folding must not coerce `BigInt` to `Number`; arithmetic promotion, integer division and overflow behavior need explicit rules. `bool` must not be treated as a numeric float by default. WGSL may reject these new storage/scalar forms explicitly until a faithful implementation exists.

The CUDA launcher already passes caller-owned pointers and computes buffer bytes from artifact dtypes. Extend PyTorch dtype mapping and artifact validation together. The importer should preserve `torch.int64`, `torch.int32` and `torch.bool` metadata, reject unsupported mixed-dtype operations with a named diagnostic, and leave exact source input order unchanged. The output structure and mutation metadata continue through the existing dispatch path.

## Batch implementation sequence

1. **Typed storage and reference substrate.** Add exact typed tensor data and scalar IR types, typed constants, casts, comparisons, integer arithmetic, CUDA temporaries and runtime dtype mapping. Check large `i64` identity values (including values above2^24), negative values, bool masks and mixed float/int storage. Run the full importer census only after this substrate can execute the representative fixtures.
2. **Indirect reads.** Implement `embedding` and `index_select` using one runtime-indexed read mechanism. Source options such as `padding_idx`, `max_norm`, index rank and negative indices must be audited before binding each call form. Qualify all complete candidate families, not a single shape. Inspect generated loads and memory coalescing.
3. **Mask and ordered scan.** Implement the observed `eq`/`ne`, `masked_fill`, `cumsum` and typed reductions with explicit output dtype and effect semantics. `cumsum` is a prefix scan, so a plain reduction replacement is invalid. Handle in-place masks through the existing effect path or reject source forms that exceed its guard.
4. **Residual typed families.** Re-census and cluster their *new* first errors. Bind shape-only `torch.sym_sum` and cast forms when their source behavior is known; connect existing floating operations without widening or narrowing at unintended points. Replay whole families under original PassBench scoring.

Compile all graphs in a batch locally before serialized GPU timing. The first fixtures are semantic, not a separate test suite for each operator. The original evaluator's numerical and exact-match results determine accepted task counts. If a family reveals multiple later blockers, keep it in the cohort and fix the shared mechanism; do not declare success from removing only its first error.

## Optimization experiments enabled

Typed indexing permits a distinct strategy family: fuse pointwise consumers into a gather, materialize or recompute loaded indices, change output order for coalescing, specialize constant index metadata, and select tile sizes from index distribution and row width. Ordered scans permit scan decomposition and placement choices. Boolean masks permit predicate placement and branchless versus predicated execution comparisons. Each proposed strategy needs a legality rule tied to dtype and effects, and a held-out complete-family score comparison. Kernel timing alone does not establish a compiler improvement.

## Review gates

- Verify exact integer and Boolean reference behavior before trusting optimizer rewrites or constant folding.
- Keep data-dependent reads distinct from static views in IR and in generated-kernel identity.
- Preserve pointer/buffer dtype agreement through export, Python allocation and CUDA launch.
- Use original PassBench matching, numerical checking and scoring for every newly complete family; report all shapes and dtypes.
- Compare any new indexing policy with the unchanged compiler on disjoint held-out task families at fixed search budget.
