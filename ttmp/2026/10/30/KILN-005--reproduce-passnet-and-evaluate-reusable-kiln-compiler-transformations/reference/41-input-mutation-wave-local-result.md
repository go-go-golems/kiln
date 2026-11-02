# Guarded input-mutation wave: local result

## Compiler change

The FX importer now accepts a mutating operation whose source is either a fresh single-use compiler value or a direct source input with exactly one FX use. For the latter, it emits a pure Kiln computation and a hidden final-value output such as `__mut6`. It records `input_mutations` in the task manifest. A public return of the mutated value is encoded as `input_alias` rather than an ordinary output buffer. `CorpusDispatch` launches the compiled program, copies each hidden final value into the corresponding caller-owned PyTorch input and reconstructs public outputs using the original input tensor for alias leaves. Later source reads and overlapping views of a mutated input remain outside this guarded implementation.

The change extends the existing FX importer, manifest, dispatch and compiler artifact path. It does not add an alternative evaluator or a separate code generator. It covers the source first-error groups for in-place SiLU, ReLU, hardtanh, augmented arithmetic, `torch.relu_` and method `relu_` where their operands satisfy the guard. Reference40 describes the full effect contract and remaining alias cases.

## Corpus and local evidence

The full 2,060-graph fake-metadata census moved from **1,584 to 1,668 imported graphs** and **119 to 131 fully importable tasks**: 84 newly imported graphs, 12 newly complete families and zero import regressions. The new zero-based task indices are **17, 45, 49, 94, 96, 111, 131, 147, 161, 172, 176 and 196**. Their complete task membership contains **96 variants**. The exact before/after audit hashes and membership hashes are in `sources/input-mutation-wave-delta-v1.json` and `sources/input-mutation-wave-task-plan-v1.json`.

All 96 variants exported and compiled locally with Node26.13.0, A100 schedule target, separate contraction and the internal synthetic reference check explicitly bypassed. The source/artifact archive is `sources/input-mutation-wave-local-compile-v1.tar.gz`, SHA256 `bff91c9cf4906def9b66f6e51d123d6c7c28e6cd08fecb89db61220e0e3d853c`. The source-derived pass generator succeeded for all 12 families, producing 24 distinct pattern modules; 78 of the 96 variants carry an input effect. Its archived evidence is `sources/input-mutation-wave-patterns-v1.tar.gz`, SHA256 `cbdd839401375d134d24f809ee88628600a261e433f8e2f8ef86eb4ca34a2252`. The focused importer, dispatch and pattern-generation test group passed 37 tests after updating the old input-mutation rejection expectation.

This is **import, local compiler and pattern-generation evidence only**. It does not prove that PassBench matches the generated pass, that the CUDA writeback has correct stream ordering, that the numerical checker accepts every variant, or that the copy cost is competitive. The GPU replay must retain all 96 variants, the original external correctness/scoring path and the explicit current snapshot. A passing family requires every graph to match and pass at t=-5; process completion alone is not acceptance.

## Next experiment

The 12-family plan is staged on bling from committed source `5df0172`, with remote snapshot and task membership verified in `sources/input-mutation-wave-gpu-v1/staging.json`. A separate tmux queue, `kiln-input-mutation-wave-v1`, waits for the earlier breadth queue and verifies both prior result ledgers before launching this GPU replay. It has not launched the mutation run at this checkpoint. Audit the generated pass match count, numerical curve, returned alias behavior and scores separately. If CUDA semantics fail, classify by shared cause before changing the importer. If they pass but score poorly, separate writeback overhead from compiler-kernel quality before testing effect-aware storage reuse.
