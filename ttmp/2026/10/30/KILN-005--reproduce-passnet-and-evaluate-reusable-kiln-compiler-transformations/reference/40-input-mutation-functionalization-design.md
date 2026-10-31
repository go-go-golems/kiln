---
Title: Input mutation functionalization and alias-preserving execution design
Ticket: KILN-005
Status: proposed
Topics: [kiln, passnet, effects, aliasing]
DocType: design
Intent: implementation
Owners: []
RelatedFiles: [integrations/passnet/fx_import.py, integrations/passnet/dispatch.py, integrations/passnet/runtime.py, integrations/passnet/generate_pass.py]
ExternalSources: [https://docs.pytorch.org/docs/2.9/generated/torch.func.functionalize.html, https://docs.pytorch.org/docs/2.9/generated/torch.Tensor.add_.html, https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.silu.html]
Summary: Functionalize FX mutation while preserving input storage updates and returned aliases at the PyTorch boundary
---

# Input mutation functionalization and alias-preserving execution

## Why this is a compiler capability

The current FX importer permits an in-place call only when its operand is a fresh, single-use compiler value. A mutation of a caller-owned input must update that input's PyTorch storage and return the same tensor object when the source program returns the mutated value. Replacing it with a pure expression without these effects changes observable behavior. For example, a materialized PassNet ResNet fragment computes convolution and batch normalization, then executes `in_6 += tmp_6` and returns the mutated input through another local name. An EfficientNet fragment executes `silu(in_0, inplace=True)` before pooling. These are real source programs in the ticket's `sources/upstream/` corpus.

The full current import audit records **143 graph variants across 19 task families** whose first failure is an in-place operation or a missing `relu_` binding. The source-pattern audit (`sources/mutation-source-patterns-v1.json`) found 55 distinct model source hashes. In 135 of those 143 variants, the first mutation operand is a source input; the other eight first mutate a temporary. The first-error counts are 45 SiLU, 42 ReLU, 35 augmented addition, 10 hardtanh, three true division, six method `relu_` and two function `torch.relu_`. These counts describe first blockers, not guaranteed task unlocks. The audit script uses source AST and must not be treated as a complete alias proof.

[PyTorch's functionalization API](https://docs.pytorch.org/docs/2.9/generated/torch.func.functionalize.html) describes the relevant semantic decomposition: replace intermediate mutation with pure operations, then copy updated values back to function inputs to preserve input effects. The official [in-place addition](https://docs.pytorch.org/docs/2.9/generated/torch.Tensor.add_.html) and [SiLU](https://docs.pytorch.org/docs/2.9/generated/torch.nn.functional.silu.html) pages provide source operation signatures. Their exact versioned HTML is archived in `sources/pytorch-2-9-mutation-docs-v1.tar.gz` with URL and hashes in the adjacent archive receipt. This design adopts the semantic approach; no PyTorch implementation code is copied.

## Required contract

The FX import result should distinguish the pure computed values from effects at the external execution boundary:

```json
{
  "script": "... return {out0: result, __mut0: updated_input}; ...",
  "output_structure": {"tuple": [{"input_alias": 0}]},
  "input_mutations": [{"input_index": 0, "output": "__mut0"}]
}
```

The example is a proposed extension of the existing manifest, not an existing schema. The hidden `__mut0` output is the final value that must replace input0's storage. `output_structure` describes the public return object; an `input_alias` leaf requires the original caller tensor after mutation. For a program that mutates an input and returns a separate pooled result, the public output leaf remains `{"output":"out0"}` while the hidden effect output is still required.

At import time, maintain an abstract storage identity for each FX value and a current value version for each storage identity. A mutating operation reads the current version, emits the equivalent pure Kiln expression, updates the storage's current version, and marks an external input for writeback if that storage came from a placeholder. Later reads through an alias must use the new version. The first implementation may reject complex overlapping views until their index/update maps are represented; it must not silently treat a view as independent storage.

```text
for node in FX order:
    operands = resolve_current_versions(node.args)
    if node is supported mutation:
        updated = lower_pure_equivalent(node, operands)
        verify_shape_dtype_and_alias_contract(node)
        storage.current = updated
        fx_value[node] = (updated, storage)
        if storage belongs to input: effects[input] = updated
    else:
        fx_value[node] = lower_existing_path(node, operands)
emit public outputs using value and alias identities
emit one hidden final-value output per mutated input
```

The implementation should add one effect/alias analysis around `fx_import.py`, not duplicate every operation lowering. The existing pure compiler pipeline receives ordinary Kiln values and hidden outputs; its transformations can optimize them under the same numerical contract. The external manifest and runtime carry the writeback requirement.

## Runtime ordering and alias identity

`TorchProgram` currently allocates output buffers and launches kernels on the caller's current CUDA stream. The safe initial execution path is to compute hidden mutation outputs in separate buffers, then issue `input.copy_(hidden_output)` on that same stream after all Kiln kernels have launched. This avoids overwriting input elements while other generated kernels still read them. A later in-place storage reuse policy can remove that copy only after proving the relevant read/write schedule is safe and measuring its effect.

`CorpusDispatch` must pass `input_mutations` to the runtime path and reconstruct public outputs *after* enqueuing the copies. An `input_alias` leaf must return the original input tensor object; returning an equal newly allocated tensor is insufficient. This matters in PassBench because the compiled and eager model calls reuse input tensors across warmups and trials, and the evaluator compares the eventual outputs. The current evaluator's `make_model_call` binds one input dictionary once; a mutation changes values seen by later calls. Correctness must therefore be checked through the original evaluator, not solely by comparing a single fresh-input invocation.

The first target is exact input mutation with no overlapping view write and shape-preserving arithmetic/activation. The semantic legality condition is explicit: no unsupported alias may observe an inconsistent value version. Internal temporary mutations can be represented as pure expressions once all aliases are tracked. Later work may add view-update maps and storage reuse, but the first external acceptance must include the input writeback and returned alias behavior.

## Implementation and evidence sequence

1. Add explicit effect metadata to FX import and manifest validation. Keep a list of mutations and public aliases rather than inferring them from output names at runtime.
2. Lower the source operations as pure arithmetic, retaining existing operation-specific dtype rounding. Record the final version of each mutated input and export it as a hidden output. Verify read-after-write and repeated-mutation cases.
3. Extend `TorchProgram`/`CorpusDispatch` to enqueue writebacks on the same stream and restore public output alias identity. Add a small CPU oracle for source alias/effect semantics and a native CUDA fixture for one `add_` and one in-place activation.
4. Run the full 2,060-graph import census once after the coherent capability lands. Export and compile every newly complete family, then replay those complete tasks through the pinned PassBench checker/scorer. Report phase failures and score, including any copy overhead.
5. Use the accepted mutation families to test effect-aware fusion and safe in-place output storage reuse as separate optimization policies. Compare unchanged and candidate compilers on held-out whole families; do not infer a pass gain from importer success.

Open questions requiring evidence before implementation are whether the source-derived FX matcher preserves mutation and alias identity for each affected family, how many families use overlapping views, and whether the current Kiln artifact writer emits duplicate output names with shared buffer IDs when a public result equals a hidden mutation value. These are boundary checks for the implementation, not reasons to reduce the 200-task target.
