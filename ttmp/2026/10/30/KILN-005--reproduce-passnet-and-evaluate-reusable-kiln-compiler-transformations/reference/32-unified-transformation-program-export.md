# Applying one transformation program in policy studies and PassBench exports

## Purpose

The existing compiler-policy study compiled `kiln-transformation-program/1` artifacts with `integrations/passnet/compile_policy.mjs`. PassBench corpus compilation used `scripts/kiln-export.mjs` and had no way to select that same transformation. The new exporter option connects these two paths while retaining the same policy validator and pipeline application function.

The executable program grammar remains in `integrations/passnet/transformation_program.mjs`. `prepareOptimizationProgram` validates a declarative policy and returns prepared decisions or a pipeline transform. `applyOptimizationProgram` applies that prepared object to the standard Kiln pipeline. Both `compile_policy.mjs` and `kiln-export.mjs` call it. The workbench `compileScript` function accepts an optional `transformPipeline` callback, so the standard frontend, parameter collection, IR pipeline, local reference check and program export remain shared.

```text
policy JSON → prepareOptimizationProgram → applyOptimizationProgram
                                            ↙                    ↘
                              compile_policy.mjs          kiln-export.mjs
                              direct policy study         PassBench corpus
```

The corpus CLI forwards two explicit options to the exporter:

```bash
python3 integrations/passnet/corpus.py compile \
  --directory /path/to/corpus \
  --kiln /path/to/kiln \
  --target a100 \
  --contraction separate \
  --optimization-program /path/to/program.json
```

The export artifact records the full validated `compiler_policy` and the SHA256 of the exact program file in `source.optimization_program_sha256`. The corpus compile receipt records the complete command for each graph. The default exporter path is unchanged when no optimization program is supplied. Custom project pipelines are rejected for this option because the policy grammar's applicability contract names the standard Emmy pipeline.

For the low-precision diagnostic population, `corpus.py compile` also exposes `--skip-internal-reference-check`. It forwards the existing exporter `--no-check` flag and is never implicit. This bypasses Kiln's synthetic-input frontend-versus-loop check; it does not change PassBench's later numerical checks. Such runs must be labeled separately, as in reference31.

## Targeted verification

The local smoke source was the existing FP32 pointwise convolution graph `sources/pointwise-agent-development-v1/corpus/000.kiln.js`. Target A100, separate contraction and Node26.13.0 were used. The ordinary exporter emitted one convolution kernel. The new policy route emitted a tiled contraction kernel plus an elementwise kernel. Its CUDA source exactly matched the established `compile_policy.mjs` artifact for that graph. The corpus CLI forwarded the policy successfully and produced the same CUDA. The baseline exporter CUDA also matched its established control.

After centralizing policy application, `compile_policy.mjs` was run on all eight existing pointwise development graphs. Every generated kernel identity and CUDA source matched its pre-change artifact. `sources/optimization-export-bridge-smoke-v1/comparison.json` records the source and policy hashes, kernel counts, corpus receipt, and all eight regression comparisons. This is compilation identity evidence only; it adds no new GPU timing, PassBench acceptance or held-out generalization claim.

## Next experiment

Use the corpus exporter with an unchanged control and one fixed reusable transformation on a newly declared set of supported PassBench tasks. Freeze task membership and policy identity before GPU evaluation. Compile both variants from one source snapshot, run them through the same normalized matcher and original numerical/scoring path, then compare exact executable fingerprints and timings. Report unsupported or failed graphs rather than filtering them from the denominator. This experiment connects the existing self-optimization research to PassBench task scores without introducing a second evaluator.
