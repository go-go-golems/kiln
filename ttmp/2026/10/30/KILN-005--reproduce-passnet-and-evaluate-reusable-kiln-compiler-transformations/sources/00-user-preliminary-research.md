# User-provided preliminary research: PassNet and Kiln

Source: user message “Reproducing PassNet and integrating it with Kiln”, supplied in this conversation. This document preserves its technical proposals in condensed form; it is not a verbatim transcript. Claims below require primary-source verification.

## Experimental separation

First reproduce PassNet unchanged; then evaluate Kiln-generated passes through PassBench. Preserve an untouched evaluator so compiler, agent, and benchmark changes remain distinguishable. PassNet comprises PassNet-Dataset, PassBench, and PassAgent. A pass consists of matcher M and replacement R, and must generalize over multiple shapes/dtypes sharing a pattern.

The proposed question is whether an LLM can learn reusable Kiln optimization changes that generalize to real held-out graphs and outperform specialized per-task kernel generation.

## Reported reference results and protocol

The supplied research reports 200 tasks and 2,060 graphs. Sample correctness / geometric mean speedup on correct graphs / aggregate score:

| System | Correctness | Speedup | Score |
|---|---:|---:|---:|
| Eager | 100% | 1.000 | 1.000 |
| Inductor | 64.5% | 0.846 | 0.706 |
| GPT-5.4 | 47.0% | 0.821 | 0.410 |
| Sonnet 4.6 | 52.0% | 0.835 | 0.448 |
| Qwen3-30B-A3B | 7.5% | 0.693 | 0.139 |
| Fine-tuned Qwen | 44.0% | 0.809 | 0.371 |

Reference hardware/software: A30 24 GB SM80, Ubuntu 24.04.1, CUDA 12.8, cuDNN 9.10.2, PyTorch 2.9.1+cu128, Triton 3.5.1. Paper: 20 warmups, 100 trials, rerun if IQR exceeds 20% median; temperature zero, up to 50 iterations, single-shot with iterative feedback. Resolve README discrepancies: 25 warmups and squared slowdown description versus paper 20 and scorer p=0. Measure GPU-only and end-to-end latency separately.

Training is a separate experiment: 4,476 instances, two teacher trials, 3,899 filtered trajectories; five epochs, batch eight, initial LR 2e-5 with cosine decay, context 262,144. Do not conflate inference reproduction with training reproduction.

## Proposed bridge and API boundary

FX graph → typed interchange → Kiln tensor IR → transformations → loop IR → scheduling → GPU IR → CUDA → PyTorch-callable runtime → original PassBench correctness/timing/scorer → Kiln evidence.

Initial mode retains PassBench matching and invokes Kiln-produced CUDA. Later mode generates Kiln-native IR transformations. Proposed modules: fx_export.py, fx_schema.json, fx_import.js, compiler.js, runtime.py, evaluate.py under integrations/passnet. These names and the interchange are design proposals.

Interchange must preserve shape, dtype, stride, broadcasting, overload semantics, scalar arguments, multiple outputs, aliasing and output structure. Reject unsupported operations explicitly. Candidate mappings include add, mul, relu, exp, sum, reshape, transpose, matmul; each must be checked against actual Kiln APIs and ATen overloads.

Kiln starter proposal uses kiln_launch.open_program(path, backend="cuda", allocate=False), caller-owned x/y/out data pointers, scratch allocations, and current PyTorch CUDA stream. Example program computes add(relu(x), y) for FP32 [16,256]. Export with scripts/kiln-export.mjs --script ... --target a100 --out ...; A100 is only a scheduling proxy for A30. Proposed Python pass exposes pattern, replacement_args, replacement_func and stable module-level wrapped replacement. Validate matching, Dynamo capture, stream lifetime, allocations and integrity checks.

Starter ZIP cited by user: sandbox:/mnt/data/kiln-passnet-starter.zip. This is a prior-session link, not an accessible local artifact yet. Reported checks were Python syntax and CPU imports only, with no CUDA validation.

## Coverage and validity

Kiln is described as FP32-oriented with limited U8 support; broad FP16/BF16, layout/strides, dynamic shape and operation coverage need investigation. Start with a declared FP32 development subset, but keep unsupported full-benchmark tasks visible under the declared official scoring protocol. No silent filtering.

Retain AST inspection, dispatch interception and reverse-order checking. If an audited Kiln integration requires evaluator changes, label its measurements as a modified protocol. Runtime dispatch and allocation overhead must be measured separately; a future compiled custom operator is a separate experimental change.

## Meta-optimization experiment

Explore (A) parameters of existing transformations, (B) compositions of compiler primitives, (C) new passes. Proposed starting point: mergeLoopOps in packages/kiln/src/std/loop.js, reportedly using a 1.02 work-growth threshold. Verify this before parameterizing. Candidate policies may use launch savings, memory traffic, duplicated work and occupancy; preserve legality separately from profitability.

Fit on graph-family training split; evaluate unchanged compiler policy on held-out families. Proposed training objective is mean(log(T_baseline/T_candidate)) minus lambda times compile cost. Continue reporting official error-aware PassBench score for external comparisons. Distinguish kernel improvement, reusable compiler improvement and search-system improvement.

Experiment matrix: E0 eager; E1 Inductor; E2 original agent with Triton/CUDA; E3 existing Kiln; E4 manual fusion policy; E5 LLM parameters; E6 LLM transformation compositions; E7 LLM new passes.

Milestones: establish reference baselines; pass original checker for a genuine Kiln-lowered graph; obtain original scorer result; establish supported training/held-out subset; improve reusable fusion policy on held-out tasks; generate/combine transformations. Longer-term investigate generalizing successful optimization traces and semantic legality analyses informed by Strata.

## Primary references supplied

- https://arxiv.org/html/2605.29357
- https://github.com/PaddlePaddle/PassNet
- https://huggingface.co/datasets/PassNet/PassNet
- https://github.com/PaddlePaddle/PassNet/blob/develop/Dockerfile.nvidia
- https://github.com/PaddlePaddle/PassNet/blob/develop/pass_agent/README.md
- https://github.com/PaddlePaddle/PassNet/blob/develop/pass_bench/README.md

## Additional user execution authorization

User: “you can use bling.local: which is a DGX spark to run your workfloads”. Record actual host properties and hardware deviations before interpreting any measurements.
