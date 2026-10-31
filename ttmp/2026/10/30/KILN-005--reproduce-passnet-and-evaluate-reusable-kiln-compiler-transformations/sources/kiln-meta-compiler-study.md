---
title: "Kiln: Toward a Self-Improving Compiler Optimization Framework"
subtitle: "Literature, architecture, mathematics, and a reproducible implementation agenda"
author: "Research and implementation study"
date: "Research cut-off: October 30, 2026"
lang: en-US
fontsize: 11pt
---

> **Decision brief.** Keep Kiln's compiler operational. Make its policies and transformation strategies explicit, checked, replayable artifacts. Evaluate reusable compiler improvements on unseen workloads before expanding to unrestricted compiler synthesis.
>
> **Evidence scope.** 81 external reference records; targeted inspection of Kiln, Strata, and the supplied integration prototype. No CUDA performance result or training run was reproduced for this study.

# Executive synthesis

**Recommendation: develop Kiln into a compiler whose optimization strategies are explicit, versioned, testable programs—and whose search system can improve those programs across workloads.** Do not begin by replacing LLVM, reproducing every CUDA kernel agent, or allowing an LLM unrestricted control of the compiler and its evaluator.

The appropriate research combination is not “PassNet, but in JavaScript.” It is a layered system:

| Responsibility | Strongest guides | Proposed Kiln result |
|---|---|---|
| Discover deployable compiler policies | Magellan; MLGO | Small deterministic profitability programs |
| Construct executable transformation strategies | Exo 2; MLIR Transform; Little Dragon | A typed, replayable transformation language |
| Discover reusable rules | Ruler; TASO; Souper | Candidate rewrites with explicit semantic obligations |
| Search tensor implementations | MetaSchedule; Mirage; Cleave | Hierarchical graph/schedule search |
| Evaluate realistic workloads | PassNet; FastKernels; FlashInfer-Bench | Independent evaluation adapters |
| Reject misleading improvements | PeepholeBench; KernelBench-Verified; CUDAnalyst | Hidden tests, causal comparisons, promotion gates |

These works solve different problems. Their contributions should be combined at interfaces, not blended into one supposedly interchangeable benchmark. [[R01](https://arxiv.org/abs/2605.29357), [R02](https://arxiv.org/abs/2601.21096), [R03](https://arxiv.org/html/2610.20980), [R04](https://arxiv.org/abs/2607.02684), [R05](https://arxiv.org/abs/2411.07211), [R06](https://arxiv.org/abs/2409.03864), [R07](https://mlir.llvm.org/docs/Dialects/Transform/), [R11](https://arxiv.org/abs/2108.10436), [R15](https://catalyst.cs.cmu.edu/projects/taso.html), [R16](https://www.usenix.org/conference/osdi25/presentation/wu-mengdi), [R17](https://arxiv.org/abs/2610.07742), [R18](https://proceedings.neurips.cc/paper_files/paper/2022/hash/e894eafae43e68b4c8dfdacf742bcbf3-Abstract-Conference.html), [R22](https://arxiv.org/abs/2101.04808), [R27](https://arxiv.org/abs/1711.04422), [R32](https://arxiv.org/html/2607.16241), [R33](https://fastkernels.github.io/), [R34](https://proceedings.mlsys.org/paper_files/paper/2026/hash/37e44c4b5321605735be9761f9b758fc-Abstract-Conference.html), [R45](https://proceedings.mlr.press/v306/chong26b.html)]

The most consequential additions to the earlier discussion are **Magellan**, which directly synthesizes executable compiler decision logic; **Little Dragon**, an October 14, 2026 preprint about constructing and refining compiler-transformation scripts; **Cleave**, an October 6, 2026 preprint separating symbolic algebraic search from concrete scheduling; and **PeepholeBench**, which evaluates patches to LLVM itself. These make the proposed research direction more concrete, but also mean that “LLMs improve compiler passes” is not, by itself, a new research contribution. [[R02](https://arxiv.org/abs/2601.21096), [R03](https://arxiv.org/html/2610.20980), [R04](https://arxiv.org/abs/2607.02684), [R17](https://arxiv.org/abs/2610.07742)]

Kiln's opportunity is a more specific combination: **semantic contracts + reusable transformation programs + persistent experimental evidence + measured cross-program improvement**. The strongest initial experiment is to improve the profitability policy of its existing loop-fusion rule, then progress to selective-fusion algorithms expressed through a checked transformation API. This recommendation follows the inspected source, not an assumption that Kiln already has a complete proof system. **K01–K04** in the local-source appendix identify the relevant files.

## What to build first

Build a small, complete research loop before adding another backend:

> Capture a family of tensor programs; expose a compiler decision; synthesize a bounded policy; compile through the unchanged backend; check correctness independently; measure on real hardware; promote only a policy that generalizes to sealed workloads.

Its first output should be a **new compiler artifact**, not merely the fastest kernel found during search. A successful artifact must improve unseen programs without a new task-specific LLM conversation. That is the difference between a useful kernel optimizer and an improved compiler.

The immediate deliverables should be a policy interface around fusion, immutable experiment manifests, a transformation-trace codec, a correctness corpus, and a supported-workload adapter. The first learning baseline should be a parameter sweep or small decision tree. LLM synthesis earns its place only if it exceeds those simpler alternatives under equal search budgets.

## What this study establishes—and does not

This is a literature and implementation study through **October 30, 2026**. It incorporates **81 external reference records**, a targeted inspection of the uploaded Kiln and Strata source archives, and a source audit of selected PassNet interfaces. It is not an independently reproduced performance result. No CUDA benchmark, model training run, compiler migration, or end-to-end PassNet reproduction was executed for this report.

The supplied `kiln-passnet-starter.zip` remains an integration prototype. Its own README records that CUDA execution and PassBench compatibility were not tested. This report does not upgrade that status by assumption. **K07**

The proposed architecture, APIs, experiment budgets, acceptance thresholds, and implementation backlog below are **design recommendations**, not features claimed to exist in Kiln or in the cited systems. Reported research results remain authors' results under their stated protocols.

# Scope, method, and evidence discipline

## Research questions

This study asks which established techniques can help Kiln learn reusable compiler behavior; which recent systems actually change compiler logic rather than generated kernels; what representation makes those changes inspectable and composable; how correctness and performance evidence should be separated; and how to reproduce a useful subset before investing in large-scale training.

The literature search covered compiler heuristics, pass synthesis, transformation languages, tensor scheduling, superoptimization, equality saturation, verification, GPU agents, benchmarking, and textbook foundations. Searches began with PassNet and the works named in the conversation, then followed related work and author/project records. A separate recency search targeted September and October 2026. A survey was used as a discovery aid, but technical conclusions are grounded in primary papers, author pages, official documentation, and inspected source. [[R66](https://arxiv.org/html/2601.02045)]

This is a broad, structured review, not a claim that every related publication has been found. Papers with only an accessible abstract or project record receive narrower treatment than works whose methods and artifacts were inspected. The bibliography records those inspection boundaries.

## Four evidence categories

**Research findings** are statements supported by a cited paper or official project record. A preprint is labeled as such; it is not silently promoted to peer-reviewed evidence. A production engineering account is not treated as an independently reproducible benchmark.

**Source findings** are observations from inspected code. Local references beginning with **K** point to archive paths and line ranges. Repository references include a pinned commit or content hash where available. Static inspection establishes structure and intended behavior, not successful execution.

**Design proposals** are recommendations developed here. Pseudocode is marked as proposed. Quantitative budgets and thresholds are illustrative unless explicitly attributed to a paper.

**Open questions** identify missing measurements, unavailable artifacts, unsupported semantics, or hypotheses that require implementation. An unavailable or incomplete artifact is not evidence that the underlying research is false; it limits what can be reproduced from the materials inspected.

## Why a single speedup leaderboard would mislead

A result against eager PyTorch is not directly comparable with a result against TorchInductor, a vendor library, a previous generated kernel, or a theoretical roofline. Similarly, “average speedup” may mean an arithmetic mean, geometric mean, correct-only mean, or a failure-penalized score. The number of attempts, precision settings, graph-capture mode, and fallback policy can change the interpretation substantially. KernelBench, PassNet, and newer benchmark work use different evaluation constructions. [[R01](https://arxiv.org/abs/2605.29357), [R31](https://arxiv.org/abs/2502.10517), [R32](https://arxiv.org/html/2607.16241), [R33](https://fastkernels.github.io/), [R34](https://proceedings.mlsys.org/paper_files/paper/2026/hash/37e44c4b5321605735be9761f9b758fc-Abstract-Conference.html)]

Accordingly, this report prioritizes **mechanisms, interfaces, and evaluation lessons** over headline rankings. It does not extrapolate a paper's best individual improvement to Kiln, or infer general compiler superiority from a narrow task set.

# What the uploaded implementation actually provides

## Kiln's reusable foundation

Kiln's README and compiler source expose a multi-stage path from a Torch-like frontend through tensor, loop, tile, kernel, and GPU representations, with CUDA and WGSL output. Its core contains dialects, graph nodes, values, patterns, rules, passes, pipelines, decision policies, and transformation tracing. The broader workspace contains evidence, execution, and experiment packages. These are strong prerequisites for a compiler-optimization laboratory. **K01–K03**

The current core is explicitly organized around DAGs and graph rewriting. It should not be described as already equivalent to LLVM's control-flow infrastructure or MLIR's region-based IR. Supporting general loops, dominance, memory effects, and exceptional control flow would require additional representations and invariants. Conversely, forcing every high-level tensor operation into low-level SSA would discard useful structure prematurely.

The existing extension points are unusually suitable for the first experiment. `Rule` supports matching, rewriting, mutation, guards, conditions, fixed-point execution, and requirements. `Pass` exposes rule lists, traversal order, checks, helpers, knobs, and a step limit. `Pipeline` supports pass replacement and insertion, and individual rule insertion, replacement, and removal. **K02**

One earlier architectural claim needs correction.

**Kiln already provides `Rule.requires(...)`.** The proposal is not to invent prerequisites from nothing. It is to extend the existing mechanism into typed analysis dependencies, explicit preservation/invalidation, and checkable semantic obligations. The existence of a method named `requires` does not by itself establish a complete analysis manager or proof discipline.

## The concrete fusion opportunity

The inspected `mergeLoopOps` rule matches an internal producer whose users are all loop kernels. It inlines that producer into its consumers, then compares estimated work before and after. The profitability guard admits the rewrite when the new work is no more than approximately **1.02 times** the previous estimate. **K03**, lines 334–345.

This is an excellent learning target because it exposes a clear decision boundary while preserving most of the compiler. The first change should separate two responsibilities that currently meet inside one rule: deciding whether a proposed rewrite satisfies the intended semantics, and deciding whether its generated implementation is likely to be faster.

A work-count estimate does not encode every relevant GPU interaction. Our proposed feature set therefore includes launch count changes, materialized bytes avoided, duplicated producer work, consumer count, reduction structure, and later measured resource-use proxies. These are hypotheses to test—not a claim that their additive combination is an accurate hardware model.

The next experiment can alter the transformation algorithm: fuse into a selected subset of consumers, preserve the original producer for the others, and compare the whole compiled graph. That is a qualitatively larger correctness problem than changing a profitability threshold, and should be evaluated separately.

## Semantic issues to resolve before automated rule discovery

The inspected scalar-function table maps a JavaScript `a * b + c` evaluator to CUDA `fmaf`; `min` and `max` use conditional expressions in JavaScript and hardware-library spellings in CUDA. The index evaluator uses floor division, while non-JavaScript emission prints ordinary division. **K04**

These are **semantic audit targets**, not a claim that every compiled workload is currently wrong. Their significance depends on the supported domains, rounding model, NaN policy, integer signs, and reachable lowering paths. For example, floor and truncating division agree on nonnegative integer numerators with positive divisors, but not generally. A documented and enforced domain restriction can make a lowering legitimate; an undocumented assumption cannot serve as a reusable proof obligation.

Before an agent mines algebraic identities, specify the intended behavior of signed zero, infinities, NaNs, overflow, reductions, and fused operations. A reference evaluator that accidentally uses a different numerical model can reward a transformation for agreeing with the wrong oracle. Higham supplies the relevant numerical-analysis foundation; formal tensor-rewrite work illustrates why semantic scope matters. [[R10](https://adam.chlipala.net/papers/AtlPOPL22/), [R55](https://epubs.siam.org/doi/10.1137/1.9780898718027)]

## What Strata contributes

Strata's workbench contains operation/effect definitions, a control-flow-oriented IR, a reference machine, analysis infrastructure, rewriting, lowering, and pipeline contracts. Its pipeline code uses requirements, provided facts, and invalidations; the LLVM emission path is described as textual output with structural checking. The separate `strata-api` README explicitly states **“examples only”** and that nothing in that proposed API is implemented. **K05–K06**

The useful port is therefore architectural: effects, analysis interfaces, contracts, and explicit execution boundaries. Do not import JavaScript/Hermes runtime semantics into GPU arithmetic merely because both use operations and passes. Keep the numerical tensor language and the dynamic-language runtime distinct, while sharing framework interfaces where their contracts genuinely align.

# A precise taxonomy of “self-optimization”

The optimization target determines both the scientific claim and the required evaluator.

| Level | Artifact being changed | Appropriate success criterion |
|---|---|---|
| 0 | One kernel or one schedule | Faster correct implementation of that task |
| 1 | Parameters or pass sequence | Better decisions within a fixed transformation space |
| 2 | Profitability policy | Better unseen-program choices without new per-task search |
| 3 | Reusable transformation algorithm | New optimization opportunities across a program family |
| 4 | Analysis, primitive, or representation | Greater valid optimization coverage with justified semantics |
| 5 | Search/training machinery itself | Better future discovery under equal total budgets |

These levels are this report's organizing model. They are not a claim that the literature uses one agreed taxonomy. PassNet primarily addresses reusable graph replacement; Magellan targets executable heuristics; Little Dragon learns scheduling scripts; PeepholeBench examines changes to LLVM optimization implementation. Their overlap is informative, but they are not identical tasks. [[R01](https://arxiv.org/abs/2605.29357), [R02](https://arxiv.org/abs/2601.21096), [R03](https://arxiv.org/html/2610.20980), [R04](https://arxiv.org/abs/2607.02684)]

A second axis concerns **where learning resides**. Improvement may be confined to the current candidate, stored in an external memory, distilled into a model's weights, or deployed as compiler code. Memory-augmented search can improve behavior without weight updates. A faster generated kernel does not establish that the pass generator itself improved. [[R37](https://proceedings.mlr.press/v306/wiedemann26a.html), [R38](https://proceedings.mlsys.org/paper_files/paper/2026/hash/0f8426558905746fc38da5e335700aec-Abstract-Conference.html), [R39](https://arxiv.org/abs/2602.14293), [R40](https://arxiv.org/abs/2512.23236), [R41](https://engineering.fb.com/2026/04/02/developer-tools/kernelevolve-how-metas-ranking-engineer-agent-optimizes-ai-infrastructure/), [R42](https://arxiv.org/abs/2602.24286), [R43](https://arxiv.org/abs/2509.14279), [R44](https://arxiv.org/abs/2608.25570)]

For Kiln, reserve “compiler improvement” for a promoted artifact that performs better on unseen workloads. Reserve “meta-optimizer improvement” for a better discovery procedure evaluated on new optimization problems with a controlled budget. This vocabulary prevents an ordinary best-so-far search from being presented as recursive intelligence amplification.

# The closest research: what to transfer and what not to infer

## Magellan: executable heuristic discovery

Magellan couples LLM-generated C++ decision logic with evolutionary search and numerical autotuning. It studies LLVM inlining and register-allocation priorities, with preliminary XLA applications. This is the closest match to improving Kiln's existing profitability machinery. Its policy-generation loop evaluates real compiled workloads rather than treating a persuasive explanation as success. Production workloads and infrastructure constrain exact external reproduction. [[R02](https://arxiv.org/abs/2601.21096)]

**Kiln transfer:** make a policy a deployable, pure program over a versioned feature record. Search policy structure in an outer loop and constants in an inner loop. Keep semantic permission checks outside that learned policy. Evaluate the emitted graph, not merely the local policy's predicted score.

**Boundary:** synthesizing better decision logic does not automatically invent new legal transformations or prove compiler correctness. An API that exposes unrestricted compiler state expands both the search space and the review burden.

## PassNet: graph-pass tasks and an external evaluator

PassNet represents an optimization as pattern matching plus replacement across related computation graphs. Its benchmark supplies shape/dtype variants and evaluates matching, numerical behavior, and performance. The paper's reported task set comprises 200 tasks and 2,060 graphs; isolated wins do not imply an aggregate win over eager execution. [[R01](https://arxiv.org/abs/2605.29357)]

**Kiln transfer:** use its workloads and evaluator as an external test surface, initially through a narrow FX-to-Kiln adapter. Keep the original benchmark intact alongside a clearly labeled Kiln-supported subset.

**Boundary:** a reusable FX matcher wrapping a specialized kernel is not necessarily an improved internal compiler algorithm. To test the user's idea, the generated artifact should eventually be a Kiln policy, transformation strategy, or pass implementation—not just another replacement CUDA function.

## Little Dragon: learn scripts, not replacement kernels

The October 2026 preprint trains an 8B model to construct and refine complete TVM scheduling scripts. A typed, lossless edit representation preserves trace dependencies; training combines search-derived supervision and execution feedback. The paper describes 54,116 workloads and 108,594 examples, with H100 evaluation. Crucially, numerical correctness uses one random input per workload; construction baselines also use a different output interface. Those limitations matter when interpreting headline comparisons. [[R03](https://arxiv.org/html/2610.20980)]

**Kiln transfer:** create deterministic trace-to-edit and edit-to-trace codecs; distinguish explanatory text from executable payload; retain both construction and refinement examples. Require round-trip tests before training on a serialized transformation.

**Boundary:** correct trace reconstruction is not semantic proof, and a learned schedule for one workload is not automatically a reusable pass. The retrieved repository README alone does not establish that the complete training pipeline is reproducible. [[R61](https://github.com/Anna-Bele/How-To-Train-Your-Little-Dragon)]

## PeepholeBench: benchmark actual compiler development

PeepholeBench derives tasks from 21 resolved LLVM issues and 19 merged pull requests, giving agents pre-fix context. It evaluates correctness and profitability, and identifies narrow transformations and misuse of LLVM mechanisms as important failure modes. This is closer to compiler engineering than benchmarks that ask for optimized output code. [[R04](https://arxiv.org/abs/2607.02684)]

**Kiln transfer:** build a collection of minimized missed-optimization cases, each accompanied by a held-out generalization family and negative cases. Evaluate a proposed compiler patch against the full suite, not only the issue's motivating example.

**Boundary:** passing an existing regression suite can still leave a transformation unsound or unnecessarily narrow. Compiler-patch evaluation needs adversarial semantic tests as well as performance measurements.

## MLGO and MLCompilerBridge: make compiler decisions explicit

MLGO demonstrates the integration of learned decision policies inside LLVM; its engineering account discusses retaining compiler-side control while changing optimization decisions. MLCompilerBridge addresses the infrastructure needed to connect compiler optimizations with learning systems. [[R22](https://arxiv.org/abs/2101.04808), [R23](https://research.google/blog/mlgo-a-machine-learning-framework-for-compiler-optimization/), [R24](https://arxiv.org/abs/2311.10800)]

**Kiln transfer:** expose batched observations, legal actions, outcomes, and deployment formats through a stable boundary. Use Python for training and experimentation where convenient, but avoid a remote model call for every node during normal compilation. Distill winning policies into local deterministic code or compact inference models.

**Boundary:** an observation/action API is not a semantic specification. A model can make legal but consistently poor decisions, and a distribution shift can invalidate its profitability predictions without invalidating its outputs.

## Exo 2: an extensible scheduling library

Exo 2 places reusable scheduling logic outside the compiler core by combining transformation actions, program inspection, and cursor-like references that survive supported rewrites. Its central lesson is architectural: new scheduling operations can be composed from existing mechanisms rather than requiring each optimization to become an invasive compiler patch. [[R05](https://arxiv.org/abs/2411.07211)]

**Kiln transfer:** design a small action/query/reference interface. An agent should be able to inspect a loop, request a checked transformation, and obtain updated handles. Put common scheduling procedures in versioned libraries.

**Boundary:** host-language composition is not automatically bounded, terminating, or universally verified. GPU synchronization and numerical contracts require their own treatment. Borrow the abstraction before attempting to port an entire compiler implementation.

## Transform dialect, PDLL, and strategy languages

MLIR Transform represents transformations as IR controlling another IR; its documentation specifies handles, effects, and failure behavior. PDLL addresses declarative matching and rewriting. ELEVATE provides a related strategy-language lineage in which rewrite composition is explicit. These are complementary layers: describing a pattern is different from controlling a strategy over many matches. [[R06](https://arxiv.org/abs/2409.03864), [R07](https://mlir.llvm.org/docs/Dialects/Transform/), [R08](https://mlir.llvm.org/docs/PDLL/), [R09](https://michel-steuwer.github.io/files/publications/2020/arXiv-2020.pdf)]

**Kiln transfer:** separate `match`, `query`, `action`, `sequence`, `choice`, and bounded iteration. Model failed applicability as a normal result, and make partial mutation transactional. A search algorithm should enumerate transformation programs through these constructs rather than patching arbitrary JavaScript strings.

**Boundary:** none of these representations makes an invalid rewrite valid. A well-formed transformation program can still contain an unsound primitive, use stale analysis facts, or degrade performance.

## The broader algorithm-discovery lineage

**FunSearch** searches executable functions using LLM proposals, an external evaluator, and evolutionary selection. **ReEvo** makes the generated object a heuristic and uses reflections on outcomes to guide subsequent proposals. **AlphaEvolve** generalizes evolutionary coding to algorithm-discovery tasks; Magellan applies this family of ideas to compiler heuristics. The relevant inheritance is a fixed problem/evaluator boundary and reusable program output, not an assumption that verbal reflection proves a performance explanation. [[R02](https://arxiv.org/abs/2601.21096), [R69](https://papers.nips.cc/paper/2024/hash/4ced59d480e07d290b6f29fc8798f195-Abstract-Conference.html), [R70](https://doi.org/10.1038/s41586-023-06924-6), [R71](https://arxiv.org/abs/2506.13131)]

For Kiln, this suggests a deliberately narrow synthesis surface: replace one bounded decision function while keeping feature extraction, legal candidate construction, and evaluation fixed. Store proposed explanations as hypotheses alongside observations. A reflection such as “register pressure caused the slowdown” should not become trusted knowledge unless resource measurements or controlled interventions support it.

# Related GPU-agent work: useful mechanisms, different targets

## Search diversity and persistent memory

**KernelFoundry** combines MAP-Elites quality-diversity search, evolving prompts, and parameter tuning. Its evaluation includes SYCL as well as CUDA, and its distributed framework separates generation from hardware evaluation. **Proposed transfer:** maintain several distinct compiler strategies rather than only one global champion. Use behavioral descriptors such as fusion coverage, compilation cost, memory traffic, and schedule family. Do not transplant its reported SYCL speedups as expected CUDA gains. [[R37](https://proceedings.mlr.press/v306/wiedemann26a.html)]

**AccelOpt** studies reusable optimization memory on AWS Trainium accelerators. Its key transferable object is experience connecting a slower implementation to a faster one. **Proposed transfer:** store before/after IR, the exact transformation, workload predicates, measurements, and known failures. Hardware-specific instructions and NKI implementation details are not directly portable to CUDA. The memory mechanism is. [[R38](https://proceedings.mlsys.org/paper_files/paper/2026/hash/0f8426558905746fc38da5e335700aec-Abstract-Conference.html)]

**KernelBlaster** uses accumulated optimization knowledge and replay in a memory-augmented in-context approach. **Proposed transfer:** make retrieval condition on structured program and hardware features, not only natural-language similarity. External-memory updates must be distinguished from model-weight training; “textual gradient” language is not a mathematical guarantee that a gradient step occurred. [[R39](https://arxiv.org/abs/2602.14293)]

**KOPE** connects optimization experiences in a graph and targets Ascend in its principal evaluation. **Proposed transfer:** retain parentage and failed branches so that the system can recover promising intermediate states. A lineage edge records provenance, not causality. Retrieve a transformation together with its applicability conditions rather than treating every ancestor as useful advice. [[R44](https://arxiv.org/abs/2608.25570)]

**KernelEvolve** combines agentic kernel search with reusable context and heterogeneous accelerator support. Its technical-report lineage begins in late 2025; Meta's production account appeared in April 2026. **Proposed transfer:** preserve search-tree structure, local context, and distilled skills. Production throughput claims depend on application and infrastructure conditions that are not reproduced by a public microbenchmark alone. [[R40](https://arxiv.org/abs/2512.23236), [R41](https://engineering.fb.com/2026/04/02/developer-tools/kernelevolve-how-metas-ranking-engineer-agent-optimizes-ai-infrastructure/)]

These systems suggest a memory design for Kiln, but they do not justify an uncurated vector database of successful anecdotes. Store successes and counterexamples together. A useful record should answer: what changed, under what semantics, on which workload family and hardware, with what measurement uncertainty, and against which compiler version?

## Weight training versus search-time adaptation

**CUDA Agent** trains a model through staged agentic reinforcement learning, using generated tasks, execution tools, and protected verification/profiling scripts. The paper reports a 230B-total/23B-active base model and a dedicated pool of 128 H20 GPUs for execution sandboxes. That pool must not be described as the entire training cluster. The reported speedup metric is computed on correct solutions and selected from interaction trajectories. [[R42](https://arxiv.org/abs/2602.24286)]

The public project exposes a 6,000-task dataset and workflow materials. Those are useful inputs for task diversity and agent-environment design, but do not establish that all resources needed to recreate the trained model are available. **Kiln transfer:** first accumulate reliable transformation trajectories; consider supervised training only after a frozen-model search baseline works. Large-scale PPO is a later research branch, not the minimum viable compiler laboratory. [[R62](https://cuda-agent.github.io/)]

**LLM-VeriOpt** and **Verified Learning for Compiler Optimization** provide related examples of incorporating LLVM validation into learning or acceptance workflows. Their importance is the external verification boundary, not a blanket claim that every optimization they produce has a universal proof. LLVM-level validation does not directly settle CUDA races, barriers, or every floating-point approximation. [[R29](https://doi.org/10.1109/CGO68049.2026.11395239), [R30](https://arxiv.org/abs/2609.27214)]

For Kiln, three learning products should remain independently versioned: the retrieval memory, the model checkpoint, and the deployed compiler artifact. This permits an ablation in which only one changes. Without that separation, a stronger model, larger search budget, better memory, and improved compiler can all be accidentally credited to the same mechanism.

## Profiling, orchestration, and feedback attribution

**KernelAgent** exposes hardware-performance signals to a multi-agent Triton-optimization workflow. **Proposed transfer:** provide structured profiler summaries to compiler-policy search, but preserve raw measurements and the mapping from generated kernels back to IR. Agent count alone is not an explanation of performance. [[R36](https://pytorch.org/blog/kernelagent-hardware-guided-gpu-kernel-optimization-via-multi-agent-orchestration/)]

**CUDAnalyst** is particularly valuable for experimental design: it studies how feedback becomes plans, including trajectory-freezing and selective feedback interventions. **Proposed transfer:** compare two policies from the same saved compiler state and measurement context. Otherwise, a better final candidate may arise from different exploration history rather than the specific feedback component being tested. [[R45](https://proceedings.mlr.press/v306/chong26b.html)]

**CompilerGPT** uses optimization reports to guide source changes, while **HintPilot** works through compiler hints. **Proposed transfer:** turn Kiln's rejected matches, failed constraints, and cost-model residuals into structured optimization remarks. These systems are adjacent evidence for useful feedback channels, not examples of arbitrary compiler-pass invention. [[R46](https://aclanthology.org/2026.findings-acl.1251/), [R47](https://computing.llnl.gov/casc/newsletter/vol-18)]

**CUDA Engineer / robust-kbench** is useful as an execution-feedback and robust-evaluation reference. **Proposed transfer:** separate proposal screening from actual correctness and performance evaluation. An LLM-based verifier can prioritize which candidates to execute, but should never be the authority admitting a transformation as semantics-preserving. [[R43](https://arxiv.org/abs/2509.14279)]

## Existing-kernel and low-resource accelerator optimization

**Astra** begins with CUDA kernels from SGLang and coordinates testing, profiling, planning, and coding agents. Its contribution is directly useful for discovering opportunities in existing implementations, but the produced kernel edits are not automatically reusable compiler passes. Kiln can add a generalization step: identify the IR pattern, express the edit as a checked transformation, and test it on other programs. [[R67](https://arxiv.org/abs/2509.07506)]

**Autocomp** combines a hardware-specific optimization menu with separate planning and code-generation prompts, then feeds correctness and performance results back into search. It also studies reuse of optimization schedules across similar operations. Borrow the optimization menu as a machine-readable capability catalogue, and represent reusable schedules as typed artifacts rather than informal prompt text. Its low-resource accelerator setting is informative, but should not be conflated with an NVIDIA production-inference benchmark. [[R68](https://arxiv.org/abs/2505.18574)]

## Better benchmarks and deployment boundaries

**KernelBench** provides a common kernel-generation task set and correctness-plus-performance metrics. It is valuable for comparison, but cannot be the only evidence for improvements to a reusable compiler. Its task interface evaluates generated implementations, not the breadth and maintainability of a compiler pass. [[R31](https://arxiv.org/abs/2502.10517)]

**KernelBench-Verified** strengthens tests and baseline treatment, including precision and hidden-input concerns. Its reported single-turn evaluation must not be used as a universal refutation of differently budgeted multi-turn systems. **Proposed transfer:** publish correctness coverage and matched numerical settings, and retain hidden distributions that the optimizer never sees during search. [[R32](https://arxiv.org/html/2607.16241)]

**FastKernels** and **FlashInfer-Bench** move evaluation toward production implementations and deployment-oriented workloads. **Proposed transfer:** add these after Kiln can express enough relevant operations. They are a check against winning only on weak eager baselines or tiny synthetic examples. A generated operator must still be tested in its surrounding model. [[R33](https://fastkernels.github.io/), [R34](https://proceedings.mlsys.org/paper_files/paper/2026/hash/37e44c4b5321605735be9761f9b758fc-Abstract-Conference.html)]

**KernelOPT**, a September 2026 preprint, preserves vendor-library calls while optimizing generated sub-kernels and checking the reconstructed model through several gates. **Proposed transfer:** treat existing high-performance kernels as valid components, and keep a correct baseline fallback. Kiln need not generate every GEMM itself to improve an application. Fallback usage must be reported rather than counted as an optimized success. [[R35](https://arxiv.org/abs/2609.30059)]

# The compiler foundations to combine

## Algorithm, schedule, and search space

**TensorIR** supplies a structured tensor-program abstraction, while **Ansor** and **MetaSchedule** address automated exploration of implementations. The important progression is from a fixed implementation to an explicit schedule space and then to programmable generators of that space. [[R18](https://proceedings.neurips.cc/paper_files/paper/2022/hash/e894eafae43e68b4c8dfdacf742bcbf3-Abstract-Conference.html), [R19](https://arxiv.org/abs/2207.04296), [R20](https://www.usenix.org/conference/osdi20/presentation/zheng), [R63](https://tvm.apache.org/docs/deep_dive/tensor_ir/learning.html)]

**Proposed Kiln interpretation:** maintain three separately inspectable objects: the computation, the transformation program, and the search-space generator. A sampled schedule is not the same artifact as a generator that can produce schedules for many programs. This distinction is essential for meta-optimization: the outer learner should be able to improve which candidates future compilation considers.

**Tensor Language Model** is an important predecessor to newer schedule-learning work. It places language modeling in tensor-program generation rather than treating arbitrary CUDA text as the only output space. It belongs in the learning lineage alongside search-based scheduling, not only in a list of coding agents. [[R21](https://www.usenix.org/conference/osdi24/presentation/zhai)]

A practical implication is to train on compiler-native objects before asking a model to infer every low-level hardware convention from text. However, a restricted language can hide important transformations. Search-space coverage must therefore be measured, not presumed superior because outputs are structured.

## The earlier scheduling-language foundations

**Halide** is the essential predecessor for separating an algorithm from choices about locality, parallelism, storage, and recomputation. **Exocompilation** goes further in externalizing target-specific instructions, memories, and optimization policies into user-level libraries. Exo 2 extends that trajectory toward reusable scheduling abstractions. These systems explain why a compiler can remain a trusted execution mechanism while strategies evolve outside its implementation. [[R77](https://dspace.mit.edu/entities/publication/a1eb8c3a-91fe-40d7-978d-16b31cf11178), [R78](https://dspace.mit.edu/entities/publication/39dac616-5dbb-4ad8-90fc-0f255e6e4900), [R05](https://arxiv.org/abs/2411.07211)]

The corresponding Kiln design decision is to keep the mathematical program stable while making schedule construction and target capabilities programmable. A new hardware instruction should have a declared contract and lowering, not appear as a string that an agent splices into an otherwise unverifiable pipeline.

## Cross-level tensor optimization

**TASO** automatically generates graph substitutions from operator semantics and uses them in graph optimization. **Proposed transfer:** develop a small, auditable rule-generation system for Kiln's mathematical layer, and keep the rule-discovery process separate from profitability selection. Its lineage predates LLM agents and prevents reinventing graph superoptimization as a new phenomenon. [[R15](https://catalyst.cs.cmu.edu/projects/taso.html)]

**Mirage** introduces a multi-level representation spanning GPU execution levels, enabling algebraic, scheduling, and custom-kernel decisions to interact. Its probabilistic equivalence machinery has a stated theoretical domain; it is not an automatic proof of every IEEE floating-point or concurrent execution behavior. **Proposed transfer:** compare candidate representations across abstraction levels without dropping their semantic contracts. [[R16](https://www.usenix.org/conference/osdi25/presentation/wu-mengdi)]

**Cleave** separates symbolic-shape algebraic search from concrete scheduling, including multi-reduction fusion. **Proposed transfer:** amortize algebraic discovery across shape families, then specialize scheduling with hardware evidence. This is promising for Kiln's symbolic indexing, but not a reason to copy a published speedup expectation or ignore the numerical consequences of algebraic changes. [[R17](https://arxiv.org/abs/2610.07742)]

Together these works suggest a disciplined alternative to a single enormous search: search graph identities at one level, candidate fusion structures at another, and hardware mappings later, while allowing selected feedback between levels. The proposed decomposition should be tested against a joint-search baseline on small cases; otherwise it may prune the best implementation unintentionally.

## Rule discovery and equality saturation

The original **egg** work supplies practical e-graph infrastructure, including analyses over equivalence classes and deferred invariant restoration. The **eqsat dialect** is a newer route to retaining non-destructive rewrite alternatives within compiler infrastructure rather than immediately extracting one expression from an external library. These are implementation options, not reasons to put the entire effectful GPU program into an unrestricted equivalence relation. [[R79](https://arxiv.org/abs/2004.03082), [R81](https://arxiv.org/abs/2505.09363)]


**Ruler** infers reusable rewrite rules using equality-saturation machinery and validation appropriate to its semantic domain. **Souper** synthesizes low-level optimizations through solver-based reasoning. **Proposed transfer:** search small expression grammars, retain counterexamples, and promote a rule only with an explicit domain and validation status. These methods can generate knowledge that applies to many programs rather than a single optimized output. [[R11](https://arxiv.org/abs/2108.10436), [R27](https://arxiv.org/abs/1711.04422), [R64](https://zenodo.org/records/5459312)]

**egglog** combines Datalog-style reasoning with equality saturation. **Proposed transfer:** prototype an analysis/rule-exploration service for pure expressions, where equivalence classes can accumulate facts. Keep that service out of the first fusion-policy experiment; it should earn its complexity through a measured rule-discovery task. [[R12](https://arxiv.org/abs/2304.04332)]

**Sketch-guided equality saturation** supplies a way to constrain otherwise expansive rewrite search. **Constable** addresses the practical gap between equality-saturation representations and real ML compiler infrastructure. **Proposed transfer:** use sketches or bounded goals, and measure conversion/extraction costs instead of assuming that an e-graph is a free replacement for the existing IR. [[R13](https://arxiv.org/abs/2111.13040), [R14](https://2025.splashcon.org/details/OOPSLA/42/Mind-the-Abstraction-Gap-Bringing-Equality-Saturation-to-Real-World-ML-Compilers)]

Equality saturation retains alternatives, but does not establish the truth of its input equalities. Nor does a cheap local extraction cost necessarily model GPU register pressure, data movement, and fusion interactions. The proposed extraction strategy should use a staged process: inexpensive ranking first, real compilation and hardware measurement for survivors.

## Verification and analysis

**Verified Tensor-Program Optimization via High-Level Scheduling Rewrites** demonstrates a formal tensor-language setting in which scheduling transformations can be justified compositionally. **Alive2** offers bounded translation validation at the LLVM level. These are different proof boundaries, both useful. [[R10](https://adam.chlipala.net/papers/AtlPOPL22/), [R28](https://web.ist.utl.pt/nuno.lopes/pubs.php?id=alive2-pldi21)]

The design lesson is to carry the scope of a guarantee with the artifact. A theorem over a pure array language does not automatically cover a CUDA memory model. A bounded validator result does not mean an arbitrary loop was proven for every execution. A timeout does not mean correctness, and a structural IR check is not semantic preservation.

Abstract interpretation supplies the mathematical basis for reusable static facts; a conventional compiler text supplies engineering detail about analyses, dependencies, and representation changes. Kiln should use both rather than letting each rewrite contain an ad hoc and undocumented proof attempt. [[R50](https://shop.elsevier.com/books/engineering-a-compiler/cooper/978-0-12-815412-0), [R51](https://link.springer.com/book/10.1007/978-3-662-03811-6)]

## GPU-specific verification: Kuiper and dynamic checking

**Kuiper** is a particularly relevant 2026 addition: it combines dependent types and separation logic for CPU/GPU resources, synchronization, layouts, and CUDA generation. Its repository also explicitly warns that some work-in-progress modules contain admitted proofs. Therefore, a Kiln verification experiment must identify the exact verified subset and trusted assumptions, not infer that every repository module enjoys the paper's strongest guarantees. The related PAgE paper makes AI-generated-kernel correctness an explicit research objective. [[R74](https://pldi26.sigplan.org/details/pldi-2026-papers/37/Kuiper-Correct-and-Efficient-GPU-Programming-with-Dependent-Types-and-Separation-Log), [R75](https://github.com/FStarLang/kuiper), [R76](https://pldi26.sigplan.org/details/page-2026-papers/4/The-Next-Frontier-for-AI-Generated-Kernels-Correctness)]

**GPUVerify** and **Compute Sanitizer** address different assurance layers. The former checks properties such as races and barrier divergence within its supported models. NVIDIA's tools dynamically check bounds/misalignment, shared-memory hazards, uninitialized global-memory reads, and synchronization misuse. Neither a successful dynamic run nor a race check alone establishes numerical equivalence. [[R72](https://doi.org/10.1145/2743017), [R73](https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html)]

For Kiln, use dynamic checks immediately on generated kernels; pursue a formal sublanguage for one class of primitives separately. Do not make a complete migration to F* a prerequisite for a useful optimization experiment.

## LLVM, MLIR, xDSL, and the custom-core decision

LLVM remains useful as a low-level backend and an optimization-validation target. MLIR contributes a multi-level extensible representation, and xDSL offers Python-based experimentation with MLIR-compatible infrastructure. These are options to evaluate, not reasons to abandon Kiln's existing workbench immediately. [[R48](https://arxiv.org/abs/2002.11054), [R49](https://docs.xdsl.dev/guides/mlir_interoperation/)]

**Recommendation:** preserve Kiln as the orchestration and experimentation layer. Define a stable semantic interchange and backend boundary. Prototype one kernel family through the existing CUDA emitter and through an MLIR-based path. Measure engineering effort, supported semantics, diagnostics, compile time, and resulting performance.

Port concepts before porting implementations. A library's matcher, type system, ownership model, and IR mutation assumptions may not fit a JavaScript DAG framework directly. Calling an existing optimizer through a process boundary is often a better first integration than translating thousands of lines into JavaScript.

# Mathematical model for the proposed system

This chapter develops the proposed design. Its equations specify useful contracts and objectives; they are not claims that the current repository already implements them. The foundations are program analysis, rewriting, synthesis, staged computation, and numerical analysis. [[R50](https://shop.elsevier.com/books/engineering-a-compiler/cooper/978-0-12-815412-0), [R51](https://link.springer.com/book/10.1007/978-3-662-03811-6), [R52](https://www.proof.cit.tum.de/~nipkow/TRaAT/), [R53](https://studwww.itu.dk/people/sestoft/pebook/), [R54](https://www.microsoft.com/en-us/research/publication/program-synthesis/), [R55](https://epubs.siam.org/doi/10.1137/1.9780898718027)]

## Semantics and partial transformations

Let a program $p$ have semantics $\llbracket p\rrbracket_{\mathcal S}$ under a declared semantic profile $\mathcal S$. The profile includes types, arithmetic behavior, memory effects, and observable outputs.

A transformation is better modeled as a partial computation than a total function:

$$
\tau : (p, F, h) \longrightarrow \operatorname{Result}(p', F', e),
$$

where $F$ is a collection of established facts, $h$ is the target description, and $e$ contains evidence and provenance. A failed precondition should produce a structured “not applicable” result, not an invalid graph or an unreviewed exception halfway through mutation.

For exact transformations, the obligation is:

$$
\operatorname{Pre}_{\tau}(p,F)\ \Longrightarrow\
\llbracket p'\rrbracket_{\mathcal S}=\llbracket p\rrbracket_{\mathcal S}.
$$

For languages involving undefined behavior or nondeterminism, use a precisely defined refinement relation rather than casually substituting equality. The direction of refinement matters. Deleting a legal behavior is not always an admissible optimization under every language contract.

A type checker establishes that a program belongs to a representation's well-formed subset. A semantic validator establishes a stronger property. A numerical test establishes agreement on sampled executions. These results must have distinct types in the evidence system.

## Legality is not profitability

Define two interfaces:

$$
L(\tau,p,F)\in\{\text{legal},\text{illegal},\text{unknown}\},
$$

$$
P_{\phi}(\tau,p,h,F)\in\mathbb R.
$$

The first is a semantic decision with a stated justification. The second predicts benefit. Only admitted transformations reach profitability selection. “Unknown” may trigger a stronger check, a guarded specialization, or rejection; it must not silently become “legal” because a learned score is high.

There is a useful asymmetry. Profitability mistakes can be tolerated and measured as regressions. Legality mistakes invalidate the output. Therefore the outer optimizer should initially be allowed to change $P_{\phi}$ but not the implementation of $L$.

Eventually the system can propose new analyses or legality conditions, but they enter a separate review and validation track. An LLM may suggest the predicate “indices are nonnegative.” It cannot make that predicate true by writing it into the candidate manifest.

## Analyses as maintained facts

An abstract domain $(A,\sqsubseteq)$ approximates program properties. Transfer functions should be monotone; fixed-point computation needs an appropriate convergence strategy, including widening where required for infinite ascending chains. A collection of interval, congruence, shape, alias, and uniformity facts can justify different transformations. [[R51](https://link.springer.com/book/10.1007/978-3-662-03811-6)]

For implementation, each fact should carry its analysis version, subject identity, assumptions, and dependencies. A rewrite invalidates facts whose dependencies changed. Retaining a stale range fact is worse than recomputing an expensive analysis: it can authorize an invalid transformation.

The first useful domains are deliberately modest. Integer intervals and divisibility can justify index simplification. Shape constraints can reject incompatible rewrites. A simple effect model can prevent unsafe movement across writes. Floating-point classification can distinguish assumptions such as “finite and non-NaN” from unrestricted machine values.

These domains should be tested for their own algebraic laws. Property tests for joins and monotonicity are useful engineering checks, but remain tests rather than universal proofs of the implementation.

## Symbolic indexing and constraints

For a tile mapping $i=Bb+t$ with $0\le t<B$, removing a guard requires a proof that the actual block domain implies $0\le i<N$. This cannot be inferred merely from the visual shape of a loop.

A practical initial solver can combine constant propagation, intervals, congruences, and affine inequalities. Presburger-style reasoning handles important integer-linear cases, but arbitrary symbolic multiplication or division is outside that restricted theory. The API should return `proved`, `disproved`, or `unknown` and expose the assumptions used.

Use mathematically named operations—such as floor division and truncating division—rather than one ambiguous `div`. Lower one into another only when a checked precondition establishes equivalence. This is a direct implementation response to the inspected index-expression boundary in **K04**.

## Approximation must compose quantitatively

Floating-point transformations cannot inherit every identity of real arithmetic. Reassociation, mixed precision, FMA contraction, and approximate functions need explicit permission and error treatment. [[R55](https://epubs.siam.org/doi/10.1137/1.9780898718027)]

Suppose an upstream approximation contributes error $\epsilon_1$ and a downstream function is $L$-Lipschitz over the relevant domain, with its own implementation error $\epsilon_2$. Then a suitable bound is:

$$
\epsilon_{\mathrm{total}}\le L\epsilon_1+\epsilon_2.
$$

This follows from the triangle inequality and the Lipschitz assumption. It is not available when the necessary domain or sensitivity bound is unknown. Near a singularity, normalization or division can amplify error severely.

Represent semantic modes explicitly: bitwise exact where feasible; specified IEEE behavior; bounded approximation under stated assumptions; and empirically accepted approximation for a deployment profile. Do not collapse them into one boolean `correct` field. Keep an empirical comparison tolerance separate from a mathematically established error bound.

## Counterexample-guided synthesis

Let $\mathcal G$ be a grammar of candidate policies or rewrites. A synthesis loop proposes $\tau\in\mathcal G$, checks it, and incorporates counterexamples into subsequent search. The checker may be a solver for a restricted theory or a testing system with explicitly weaker assurance. This is the useful synthesis pattern behind several foundational approaches. [[R11](https://arxiv.org/abs/2108.10436), [R27](https://arxiv.org/abs/1711.04422), [R54](https://www.microsoft.com/en-us/research/publication/program-synthesis/)]

For Kiln, begin with a small grammar of profitability policies. Later, synthesize pure scalar/index rewrites with exact semantics. Do not begin with arbitrary concurrent GPU code, where equivalence, race freedom, and resource behavior greatly enlarge the problem.

A counterexample should become a permanent regression test and a retrieval constraint. Merely telling the model “that attempt failed” loses most of the information needed to avoid repeating the error.

## Bilevel optimization of the compiler

Let $\phi$ describe a reusable compiler strategy and $z$ describe per-program schedule choices. A useful formulation is:

$$
z^*(p,h;\phi,B)=\operatorname{Search}_{B}\bigl(\mathcal Z_{\phi}(p,h)\bigr),
$$

$$
\phi^*=\arg\max_{\phi}\ \mathbb E_{(p,h)\sim\mathcal D}
\left[\log\frac{T(C_0(p,h))}{T(C_{\phi,z^*}(p,h))}\right]
-\lambda\,\mathbb E[\operatorname{CompileCost}(\phi,p,h)].
$$

Correctness and resource limits are constraints, not tradeable bonuses. $B$ fixes the inner search budget. Without fixing it, a better outer strategy could appear superior simply because it spends more time searching.

This formulation distinguishes improving the candidate space, improving its search policy, and improving numerical parameters. It also makes amortization visible: a more expensive outer search may be justified when its resulting compiler is reused across many future programs.

## Diversity and uncertainty

A quality-diversity archive retains a champion in each behavior cell rather than only the global fastest candidate. For a descriptor $b(\phi)$ and cell $c$:

$$
A[c]=\arg\max_{\phi:\,b(\phi)\in c} J(\phi).
$$

For Kiln, descriptor choices are a design decision. Useful candidates include compilation-cost bands, transformation coverage, code-size growth, and hardware specialization. Poorly chosen descriptors waste evaluations by preserving arbitrary differences. MAP-Elites is an inspiration, not an automatic answer. [[R37](https://proceedings.mlr.press/v306/wiedemann26a.html)]

Learned cost models should report uncertainty or at least calibration residuals. Their role is experiment allocation. Real hardware remains the final performance oracle, and the final winner must be remeasured independently of the samples used to select it.

## What “meta compiler compiler” should mean

There are two distinct concepts. In classical partial evaluation, specializing an interpreter can produce a compiler; specializing the specializer gives the familiar compiler-generator perspective. In empirical compiler meta-optimization, a search system produces better policies or transformations. These ideas can interact, but they are not the same operation. [[R53](https://studwww.itu.dk/people/sestoft/pebook/)]

A plausible Kiln research direction is to express a scheduling interpreter and its strategy in a staged language, then specialize the strategy into efficient compiler code. The learning loop chooses the strategy; staging removes interpretation overhead. This would connect the language/mathematics program with practical deployment.

A category-theoretic view can clarify compositional interfaces: compatible representations as objects and justified transformations as arrows. It does not supply correctness merely by naming a category. Effects, partiality, approximation grades, and implementation obligations still need explicit definitions. Treat this as a design aid, not a substitute for executable tests or formal reasoning.
# Proposed architecture: Kiln as an empirical compiler framework

## Preserve the compiler; add explicit control surfaces

The first architecture should wrap and strengthen the existing compiler rather than replace it. Keep the current computation IRs, CUDA emitter, and workbench. Add a controlled layer in which optimization strategies are artifacts, then use the evidence/execution packages to evaluate those artifacts.

```text
Workload + semantic profile + target manifest
                    |
              Program IR
                    |
       analyses -> established facts
                    |
          checked action interface
                    ^
                    |
             Transform Program
                    ^
                    |
       policy / synthesis / search system
                    |
                    v
          candidate compiler artifact
                    |
       compile -> validate -> benchmark
                    |
       immutable evidence and promotion
```

The boundaries matter more than the package names. The untrusted search process cannot redefine the correctness oracle, modify held-out inputs, or silently change precision. The compiler cannot treat an optimizer's explanation as an established fact. The benchmark cannot infer the generating pass from a filename; it needs the actual artifact identity.

## Layer A: semantics, types, and checked primitives

The trusted surface should be small enough to audit. It contains operation definitions, numerical profiles, structural verification, required analyses, and transformation primitives with documented preconditions.

A useful proposed result type is:

```typescript
// Proposed interface; not implemented in current Kiln.
type CheckResult =
  | { status: "proved"; evidence: EvidenceRef }
  | { status: "disproved"; counterexample: Counterexample }
  | { status: "unknown"; reason: string };

type ApplyResult =
  | { status: "applied"; graph: GraphRef; trace: TraceRef }
  | { status: "not-applicable"; reason: string }
  | { status: "rejected"; diagnostic: Diagnostic };
```

“Proved” must always specify the semantics and checker scope. A successful randomized test belongs in a different result field. Resource timeouts and unsupported theories should remain `unknown`.

Each primitive should declare its effect on analyses and handles. For example, an inlining action may preserve scalar types while invalidating work estimates, use counts, and scheduling costs. Facts about unchanged nodes may be reusable only if their dependency graph establishes that they remain valid.

## Layer B: transformation programs

Represent strategies as typed data or a restricted language rather than arbitrary source text. Begin with sequencing, conditional application, bounded iteration, matching, feature queries, and a small set of checked actions. Serialization must retain all decisions needed for deterministic replay.

```yaml
# Proposed artifact, not an existing Kiln schema.
format: kiln-transform/1
name: selective-elementwise-fusion
input_ir: loop
semantic_profile: fp32-defined-v1
requires:
  - shape-analysis/1
  - effect-analysis/1
body:
  - match: internal-elementwise-producer
    bind: producer
  - query: eligible-consumers
    of: producer
    bind: consumers
  - select:
      policy: fusion-profitability/7
      candidates: consumers
    bind: chosen
  - apply: inline-into-selected-consumers/1
    args: [producer, chosen]
  - apply: simplify-indices/1
budgets:
  max_actions: 500
  max_ir_growth_ratio: 2.0
```

The names above are proposed contracts, not permission to accept arbitrary predicates. The action resolver must know what each action means and which checker authorizes it. A candidate cannot invent `safe_fusion=true` and bypass the analysis.

Execution should be transactional. Capture the original graph, perform an action, verify the resulting structure and required obligations, then commit. On failure, retain diagnostics and restore the original state. This is important for nested search, where a rejected alternative must not contaminate later candidates.

Handles need explicit lifetime rules. Stable identities should distinguish an operation's provenance from a particular graph instance. When a rewrite deletes or replaces a node, users of an old handle should receive a clear invalidation result or a documented forwarding map. Silent reuse of an identifier can make traces unreplayable and analyses unsound.

## Layer C: profitability and search policies

The initial policy language should be deliberately smaller than JavaScript. Allow numerical features, comparisons, boolean combinations, bounded decision trees, and a small set of arithmetic operations. Forbid filesystem access, network calls, wall-clock inspection, graph-name matching, and unbounded loops.

A policy observes properties that would be available during ordinary compilation. It must not see a benchmark's secret identifier or the answer from a held-out evaluator. Hardware identifiers can select legitimate target-specific behavior; arbitrary task-name lookup is not evidence of generalization.

Maintain three policy forms: a human-readable source form, a normalized executable representation, and a content hash over the representation plus feature semantics. A policy change should produce a readable diff and a new identity even when its marketing name is unchanged.

In the first experiment, use deterministic policies. Later stochastic proposal generators should record seeds and sample decisions explicitly. A replayable trace is more valuable than an unrecorded random seed when library versions change sampling behavior.

## Layer D: evidence, identity, and learning data

An experiment record should bind together the workload, semantic contract, input family, compiler implementation, transformation program, policy parameters, target, toolchain, evaluator, and measurement protocol. The existing evidence package is the natural home, but its current schemas need a targeted compatibility audit before extension. **K08**

A proposed identity is:

$$
\operatorname{ID}=H(\text{workload},\text{semantics},\text{compiler},
\text{transform},\text{target},\text{toolchain},\text{protocol}).
$$

Do not use source filename, shape alone, or a human-assigned pass name as a semantic identity. Dtype, layout, strides, constants, numerical mode, and relevant environment settings can alter both behavior and performance.

Store raw timings as well as summaries. Record failed compilation, mismatches, timeouts, numerical failures, resource failures, and unsupported cases using distinct statuses. Do not discard failures from the corpus merely because a geometric mean cannot accept zero.

The learning dataset should contain at least: original IR, emitted transformation program, checked facts, resulting IR, correctness status, timing distributions, and failure diagnostics. Explanations may accompany these records but must be labeled as explanations. A model-generated assertion that register pressure caused a slowdown is a hypothesis until supported by controlled measurements.

## Layer E: compiler-artifact promotion

A candidate should progress through states such as draft, structurally valid, semantically admitted, empirically evaluated, held-out validated, and promoted. The labels should not imply stronger guarantees than the evidence.

A promoted artifact includes a fallback policy, regression summary, scope of applicability, compiler compatibility range, and rollback identity. A policy that helps one GPU can be deployed only for that target rather than forced into a universal default. A strategy that helps large tensors but hurts small ones can become a guarded specialization.

The decision to promote should be made by code outside the optimizer's editable workspace. The optimizer may propose changes to that code in a separate research branch, but cannot evaluate itself with a newly weakened oracle and claim progress.

## Representation choices: remain custom, interoperate, or migrate?

Three paths are reasonable. An extended custom core preserves the JavaScript workbench and existing tensor abstractions but requires continued investment in verification and analysis. An MLIR-centered core reuses substantial infrastructure but adds integration and dependency complexity. A hybrid keeps Kiln's orchestration while translating selected stages into an external compiler. [[R48](https://arxiv.org/abs/2002.11054), [R49](https://docs.xdsl.dev/guides/mlir_interoperation/)]

The recommended experiment is a **vertical slice**, not a platform rewrite. Choose a reduction-plus-elementwise family and implement the same semantic profile through both the current backend and one MLIR/xDSL route. Compare unsupported cases, diagnostics, compile latency, implementation effort, and final code. Do not use emitted-kernel speed alone as the architecture decision.

A shared interchange should include operation semantics, result structure, constants, dtype, shape, strides, aliasing constraints, and target requirements. It should explicitly reject unsupported constructs. A translator that silently converts a view into a copy or changes accumulation precision does not preserve the experiment.

# What to port, adapt, or leave alone

| Source | Concrete transfer | Recommended boundary |
|---|---|---|
| PassNet | Workload metadata and evaluator adapter | Keep a pinned upstream evaluator intact |
| Magellan | Outer policy-code search plus inner tuning | Reimplement against Kiln's feature API |
| Little Dragon | Lossless trace/edit codec and paired training examples | New Kiln codec; do not assume TVM trace compatibility |
| Exo 2 | Actions, inspection, stable references | Port the architecture before any implementation |
| MLIR Transform / PDLL | Transform control and pattern-language concepts | Interoperate or build a deliberately small subset |
| MLGO / MLCompilerBridge | Decision interfaces and offline training boundary | Batch observations; deploy policies locally |
| Ruler / Souper | Rule candidates and counterexample loops | Separate symbolic service with explicit theory |
| egglog | Experimental fact/equality engine | Restrict initially to pure expression domains |
| MetaSchedule | Programmable stochastic search spaces | Adapt generator concepts to Kiln stages |
| Mirage / Cleave | Cross-level search and symbolic amortization | Research branch after semantics/import support |
| KernelFoundry | Diversity archive and distributed evaluation | Reuse algorithmic pattern, not benchmark conclusions |
| AccelOpt / KernelBlaster | Structured experience retrieval | Store evidence and failures, not just advice |
| PeepholeBench | Missed-optimization issue benchmark | Kiln-specific tasks with hidden counterexamples |
| FlashInfer-Bench / FastKernels | Production-oriented evaluation | Later integration; preserve external baselines |

This is a design synthesis from the cited work, not a claim that all implementations are API-compatible or freely reusable under one license. Source, model, dataset, and generated-artifact licenses need separate review at pinned revisions. The existence of a public repository is not sufficient to establish training-data rights or redistribution permission.

## Suggested package decomposition

```text
packages/kiln/             existing program IR and lowering
packages/kiln-contracts/   proposed semantic and effect contracts
packages/kiln-transform/   proposed action/query/handle interpreter
packages/kiln-policy/      proposed pure policy DSL and deployment
packages/kiln-meta/        proposed outer search and artifact promotion
packages/evidence/        existing evidence base; extend identities
packages/exec/            existing execution base; isolate evaluators
integrations/passnet/     proposed upstream-compatible adapter
integrations/mlir/        optional vertical-slice experiment
corpora/compiler-issues/  proposed missed-optimization suite
```

These boundaries are provisional. Initially, several can be modules inside the current package. Creating many packages before their interfaces are understood would add maintenance work without improving the experiment.

# Reproducing PassNet without confusing it with extending Kiln

## Establish three separate tracks

**Track A: upstream evaluation reproduction.** Run the original workload definitions, agent interface, and scorer with a pinned environment. This asks whether the published experiment can be recreated closely enough to explain differences.

**Track B: Kiln integration.** Replace supported implementations through an audited adapter, keeping the external semantics and evaluation interface. This asks whether Kiln can correctly participate in the benchmark.

**Track C: compiler meta-optimization.** Change a reusable Kiln policy or strategy, freeze it, and evaluate unseen workloads. This asks whether the compiler improved. A successful Track B run does not answer Track C.

## What the source audit establishes

The observed PassNet `develop` commit is `61c64709f6d324216ae8252cec3cdc35b2dd5da5`, dated June 1, 2026. It is a usable audit anchor, **not established as the authors' exact experiment commit**. [[R60](https://github.com/PaddlePaddle/PassNet/commit/61c64709f6d324216ae8252cec3cdc35b2dd5da5)]

The inspected README requires `pattern`, `replacement_args`, and a `replacement_func` returning a stable module-level callable. Samples include model code and tensor/constraint metadata, and may contain multiple dtype and shape variants. The loading order is explicitly listed; a pass mismatch is not silently ignored. [[R58](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/README.md)]

Two discrepancies require explicit resolution. The paper states 20 warmups, while the inspected README describes 25. The README describes squaring slowdowns, but `aggregate_es_scores.py` defaults to `p=0.0` with the documented formula `speedup**(p+1)`. The same script supports a custom weighting function through an environment variable. Therefore the manifest must record actual command-line arguments and relevant environment variables, not just the README. [[R01](https://arxiv.org/abs/2605.29357), [R58](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/README.md), [R59](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/aggregate_es_scores.py)]

The paper's stated environment includes an A30 and specific CUDA/PyTorch/Triton versions. Reproducing on another GPU is a **hardware replication**, not the same experiment. A device preset that approximately resembles the A30 does not recreate its measured behavior. [[R01](https://arxiv.org/abs/2605.29357)]

## A minimal reproduction manifest

```yaml
# Proposed manifest; unknown fields must be filled, not guessed.
experiment: passnet-upstream-reproduction
paper: arxiv:2605.29357
repository_commit: 61c64709f6d324216ae8252cec3cdc35b2dd5da5
paper_experiment_commit_confirmed: false
container_digest: REQUIRED
workload_manifest_sha256: REQUIRED
model_provider_and_snapshot: REQUIRED
agent_max_steps: REQUIRED
sampling_parameters: REQUIRED
hardware_inventory_sha256: REQUIRED
warmups: EXPLICIT_CHOICE
trials: EXPLICIT_CHOICE
negative_speedup_penalty: 0.0
custom_weight_function_sha256: NONE_OR_HASH
precision_configuration: REQUIRED
correctness_protocol_sha256: REQUIRED
measurement_protocol_sha256: REQUIRED
```

The first check should be a supplied sample with no LLM. Next reproduce eager and compiler baselines. Then run a small fixed agent subset, preserving prompts, tool responses, errors, and actual token costs. Only after those succeed should the full task set be attempted.

A reproducibility claim should state what matched, what differed, which discrepancies remain unexplained, and whether variation across independent runs could account for the difference. A single plausible result is not enough to declare a paper reproduced.

## The Kiln adapter should begin narrow

Implement a stable export of the relevant FX graph and metadata. Translate only an explicit whitelist of supported operations and layouts. Start with FP32 elementwise operations and selected reductions; reject unsupported precision, aliasing, or stride behavior rather than silently approximating it.

The proposed round trip is:

```text
PassBench task
  -> typed FX export
  -> Kiln import + semantic checks
  -> pinned Kiln policy and pipeline
  -> generated program artifact
  -> PyTorch-callable execution boundary
  -> original correctness and timing interface
  -> evidence record
```

Preserve the original output structure and dtype. Invocation must obey the caller's CUDA stream and allocation lifetimes. Avoid hidden device synchronization that changes application behavior or makes timing appear artificially favorable. Correctness tests should include repeated calls and changing inputs so that stale output buffers are detectable.

The supplied starter suggests a path through exported Kiln programs and caller-owned pointers, but its README is explicit about its untested status and limited support. Treat it as a candidate adapter implementation, not the finished bridge. **K07**

## Coverage and integrity

Publish both the supported subset and full-corpus coverage. Unsupported tasks should remain visible with explicit reasons. A subset chosen before optimization is a legitimate development benchmark; a subset chosen afterward because those tasks improved is not a credible generalization test.

Keep an untouched PassNet environment. If the Kiln launcher requires an integrity-check allowlist or evaluator modification, document and audit it, then label that run as a modified protocol. Do not bypass restrictions through an opaque wrapper and claim upstream comparability.

Measure adapter overhead separately. For tiny kernels, dispatch and allocation can dominate. Report end-to-end call latency and device execution latency, with allocation and compilation boundaries stated. A faster wrapper is useful, but it should not be attributed to a better fusion pass.

# The first compiler-meta-optimization study

## Research hypothesis

**H1:** a reusable profitability policy over compiler-derived features can improve the latency of unseen Kiln-compiled tensor graphs relative to the existing fusion heuristic, without weakening correctness or increasing the per-program optimization budget.

**H2:** a checked selective-fusion strategy can improve the reachable implementation space beyond what any threshold policy over the current all-consumers rewrite can express.

**H3:** learning from structured transformation trajectories improves future compiler-policy discovery more than retrieving successful CUDA source alone.

These are proposed hypotheses. None is established by the current source or the literature's results on other compilers.

## Corpus construction

Start with families that expose the decision tradeoff: chains of inexpensive elementwise operations; expensive producers with several consumers; broadcasted producers; reductions feeding elementwise consumers; and graphs whose intermediate materialization is substantial. Keep graph outputs, dtype, layout, and mathematical semantics explicit.

Separate graph families before generating shape variants. A random split of shapes from nearly identical graphs measures interpolation, not broad compiler generalization. Deduplicate normalized graph structure and preserve a provenance link to the source model where available.

Use at least three evaluation slices: unseen shapes within known structures, unseen structural families, and a second target GPU when available. Hardware transfer is a separate claim; a policy may be validly target-specific.

A small initial corpus is sufficient to test the machinery. Its size should be chosen from the measured evaluation budget, not from an arbitrary desire to imitate a large paper. Publish the manifest and keep it unchanged during the first comparison.

## Baselines that the LLM must beat

Use the unmodified compiler, no fusion, the existing guard with a threshold sweep, and a small supervised or hand-built policy over the same features. Include random search over the same policy grammar and a fixed-budget schedule search. Where semantics permit, a fuse-every-eligible-case baseline helps expose the importance of profitability selection.

For the LLM condition, supply exactly the feature definitions, permitted grammar, training evidence, and evaluator interface available to the other search methods. Report both search cost and the resulting compiler's cost. A method that uses many more GPU evaluations should not win by an unreported budget advantage.

## Initial feature schema

```typescript
// Proposed v1 feature record. Units are explicit.
type FusionFeatures = {
  producerElements: number;
  producerEstimatedScalarOps: number;
  numberOfConsumers: number;
  estimatedBytesAvoided: number;
  estimatedExtraScalarOps: number;
  estimatedLaunchesAvoided: number;
  hasReduction: boolean;
  broadcastReuseClass: string;
  targetClass: string;
};
```

Treat estimates as estimates. Add measured register use or compiled-resource features only when their collection cost is accounted for. A policy that needs both alternatives fully compiled and profiled is an autotuner, not a cheap static heuristic; that may still be valuable, but it belongs in a different cost category.

The first policy grammar could support a threshold on work growth, then a linear score or bounded decision tree. Normalize units or use typed quantities so that a generated expression cannot silently add bytes to FLOPs. Bound arithmetic and handle missing features deterministically.

## Isolate the policy from the rewrite

The first patch should retain the existing candidate construction and replace only profitability selection. Record every match and decision, including declined cases. This makes it possible to compare policies on the same opportunities before studying changes that alter later opportunities.

The second patch introduces selective fusion. Its primitive must preserve the producer when unfused users remain, update use-def relations, preserve outputs, and re-establish graph invariants. Test this primitive independently before any LLM composes it into a larger strategy.

A third experiment can learn traversal and selection order. That is a distinct search target because earlier fusions change later candidates. Evaluate whole-pass behavior rather than summing local predicted benefits.

## What constitutes a meaningful result

A credible positive result contains more than one favorable geometric mean. It includes fixed test coverage, correctness outcomes, confidence intervals over independent workloads, compilation overhead, severe regressions, and a readable deployed artifact.

A negative result can still be useful. A threshold sweep may match the LLM, showing that the feature space lacks headroom. Selective fusion may outperform policy tuning, showing that the transformation space is the bottleneck. Improved isolated kernels may fail to improve a model, revealing invocation or scheduling overhead. Each outcome identifies a different next step.

The key is to ask a falsifiable question: **did this reusable compiler change improve unseen compilation results under the same budget?**

# Evaluation protocol: make improvements difficult to fake

## Separate the unit of search from the unit of inference

A candidate is a compiler artifact. A measurement is one execution under a particular environment. An evaluation case is a program/shape/dtype/layout combination. A generalization unit is a program family or source model. These are not interchangeable sample counts.

Running the same kernel ten thousand times can reduce uncertainty about its latency, but cannot establish that a pass generalizes to ten thousand independent programs. Likewise, many nearly identical subgraphs from one model can dominate a corpus unless the aggregation is grouped deliberately. Our proposed evaluation therefore uses a hierarchical record: family, graph, specialization, process/session, and timing replicate. The general concern about multiple sources of benchmark variation has a substantial systems-methodology literature. [[R80](https://kar.kent.ac.uk/33611/)]

Use grouped train/development/test splits. Hold out source models or graph families where possible; deduplicate canonical graph patterns before assigning splits; keep shape-only generalization as a separate experiment. The test set is not queried during policy search. A hardware holdout is another experiment, not a substitute for program holdout.

## Preserve denominators and report more than a geometric mean

Report, separately, import coverage, compilation success, semantic-check success, runtime success, and performance. A failure must remain visible in the denominator appropriate to the claim. “Speedup on correct supported cases” is useful but cannot substitute for whole-corpus quality. For PassNet reproduction, retain its official scoring procedure; for Kiln research, publish the raw outcomes and a fixed failure policy as well. [[R01](https://arxiv.org/abs/2605.29357), [R32](https://arxiv.org/html/2607.16241), [R58](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/README.md), [R59](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/aggregate_es_scores.py)]

For successful case $i$, define the paired log ratio

$$
z_i=\log T_{0,i}-\log T_{1,i}.
$$

An equally weighted geometric-mean speedup is $\exp(\frac1n\sum_i z_i)$. A family-balanced version first averages within each family, then across families. Choose the weighting before inspecting results. Neither aggregation rescues an incorrect implementation; correctness is a separate admissibility condition.

Also report median speedup, worst observed regressions, the proportion of workloads regressing beyond a declared threshold, compilation latency, peak memory, generated code size, and search cost. A pass that improves a broad mean while severely harming one important deployment workload needs a dispatch guard or should not be promoted globally.

## Proposed timing protocol

Pin the GPU model, driver, compiler/toolkit, precision flags, runtime mode, and compiler artifact. Record relevant device conditions and competing processes. Run isolated benchmark workers; the optimizer's own model inference should not compete for the same device during timing.

Warm up according to the selected protocol, then measure baseline and candidate in randomized paired blocks across multiple independent sessions. For tiny kernels, use an appropriate repetition mechanism, but keep graph-capture, allocation, and synchronization behavior consistent between alternatives. Capture both GPU-event latency and application-level invocation latency. Compilation and first-use latency belong in separate metrics rather than disappearing from the report.

Use confidence intervals whose resampling unit matches the claim. For corpus generalization, resample families or independent workloads, not merely inner timing repetitions. For a single kernel's latency, retain session structure. The exact number of sessions should be selected after a pilot identifies the main variance sources; a universal “100 trials is enough” rule would be unjustified.

These are proposed controls for this study, not a claim that every cited paper uses them. The independent confirmation run is particularly important: search selects apparent winners from noisy measurements, so the winning measurement should not also be the final evidence of improvement.

## Correctness is a ladder, not one Boolean

Use explicit assurance labels:

| Label | Evidence required | What it does not establish |
|---|---|---|
| Structurally valid | IR verifier and artifact type checker pass | Semantic preservation |
| Differentially tested | Independent reference checks across a declared corpus | Universal correctness |
| Dynamically checked | Sanitizers pass on tested executions | Absence of unobserved races or bad inputs |
| Translation-validated | A specified checker establishes refinement for the instance | Properties outside its model or bound |
| Proven primitive composition | Applicable primitive theorems and composition obligations discharged | Correctness of unverified backend/runtime components |

The label must name the semantic model, checker version, input domain, and limitations. “Verified” without this scope is too ambiguous for a compiler-artifact registry. Alive2, verified tensor rewrites, GPUVerify, and Kuiper inhabit different parts of this ladder and must not be treated as interchangeable proof engines. [[R10](https://adam.chlipala.net/papers/AtlPOPL22/), [R28](https://web.ist.utl.pt/nuno.lopes/pubs.php?id=alive2-pldi21), [R72](https://doi.org/10.1145/2743017), [R74](https://pldi26.sigplan.org/details/pldi-2026-papers/37/Kuiper-Correct-and-Efficient-GPU-Programming-with-Dependent-Types-and-Separation-Log), [R75](https://github.com/FStarLang/kuiper)]

The initial test generator should exercise non-multiple tile sizes, minimal dimensions, broadcast patterns, multiple consumers, degenerate reductions where supported, layout variations, and numerical corner cases permitted by the language. Include NaNs, infinities, signed zeros, and extreme magnitudes when they are in the declared domain. Excluding them is legitimate only when the contract makes the restriction explicit and enforced.

Test metamorphic properties whose preconditions are valid under the selected number system. Do not use real-number identities as unquestioned floating-point oracles. A failure should produce a minimized graph/input and enter a permanent regression corpus. Re-run that corpus whenever a primitive, analysis, or backend changes.

For a CUDA test executable, dynamic checking can be integrated using a command of this form; it is a proposed test invocation, not a command executed for this report:

```bash
compute-sanitizer --tool memcheck --error-exitcode 1 ./kernel_tests
compute-sanitizer --tool racecheck --error-exitcode 1 ./kernel_tests
compute-sanitizer --tool initcheck --error-exitcode 1 ./kernel_tests
compute-sanitizer --tool synccheck --error-exitcode 1 ./kernel_tests
```

Run performance measurements separately without instrumentation. The tool's documented error-exitcode option matters because a test process can succeed while the checker detects an error. [[R73](https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html)]

## Prevent evaluator contamination

Compiler candidates may read approved features and produce approved artifacts. They should not modify reference programs, benchmark inputs, scoring code, clocks, environment variables controlling precision, or the final evaluation split. Compilation and execution need process-level resource limits, artifact isolation, and an explicit allowlist of capabilities.

An unsupported case may fall back to the baseline only under a declared deployment protocol. Record fallback frequency and include its overhead. A fallback is useful engineering; silently counting it as a newly generated fast kernel is misleading. Likewise, graph-pattern identifiers may be useful for caching but should not let a policy memorize hidden evaluation labels.

Freeze benchmark and promotion rules before search. Changes to the evaluator require a new experiment version and remeasurement of relevant baselines. The optimizer may propose better tests, but a separately reviewed process decides whether they enter the trusted evaluator.

## Measure causal claims through ablations

A pass may appear beneficial because the adapter changed, the search budget increased, or the baseline was compiled with different precision. Hold these factors fixed when testing the pass. To evaluate memory or reflection, use the same model, candidate budget, workload set, and tool access with that component disabled. CUDAnalyst's emphasis on controlled feedback comparisons is especially relevant here. [[R45](https://proceedings.mlr.press/v306/chong26b.html)]

A minimum ablation set for the first project is: existing heuristic; tuned scalar threshold; bounded learned policy; LLM policy without retrieval; the same policy generator with retrieval; and selective fusion with the policy held fixed. This separates improvements to the decision boundary, proposal quality, and transformation space.

# A concrete implementation backlog

## Milestone 0: establish identity and a semantic baseline

**Implement:** a manifest containing source-archive identity, compiler revision, workload identity, numerical contract, backend flags, runtime version, and measurement protocol. Add deterministic serialization for policy and transformation artifacts. Pin the baseline pipeline and preserve its outputs.

**Acceptance:** identical artifacts and environments reproduce the same canonical identifiers; changes in dtype, layout, numerical mode, rule version, or backend flags change the relevant identity. Unsupported fields cause a diagnostic rather than being omitted. The regression corpus includes the scalar/index semantic cases identified in K04.

This milestone is necessary before learning because contaminated identities can make measurements from one semantic computation appear to describe another. Do not treat a display name or a source-code string alone as a complete experimental identity.

## Milestone 1: expose fusion as a decision service

**Implement:** factor the current rule into candidate construction, legality checks, feature extraction, profitability selection, and commit/rollback. Preserve the current behavior behind an adapter. Record declined as well as accepted candidates.

**Acceptance:** the compatibility policy reproduces baseline decisions on the fixed corpus; features are deterministic and unit-defined; the policy cannot mutate IR; malformed or timed-out policy execution falls back predictably; graph checks run after a commit.

The first policies should be plain deterministic functions or a restricted expression tree. Do not add an inference-model dependency to every compilation. The learning system can be expensive offline while the deployed decision remains cheap.

## Milestone 2: build the pass-level evaluator

**Implement:** run a compiler variant over a manifest of workloads, produce reference comparisons and timing records, and aggregate results with fixed coverage accounting. Add the narrow PassBench bridge as an external adapter, not as a dependency of the core compiler.

**Acceptance:** a deliberately incorrect pass is rejected; a pass that never matches is reported distinctly; an unsupported dtype is visible; a known injected slowdown is detected; failures and timeouts survive aggregation. Baseline and candidate use the same launch/runtime adapter.

At this point a grid search can already improve a compiler policy. This is the first useful end-to-end system, even without an LLM.

## Milestone 3: synthesize compact profitability policies

**Implement:** bounded policy grammar, feature metadata, candidate deduplication, mutation/proposal interface, and search budget accounting. Compare threshold sweeps, random search, a simple learned tree, and LLM-generated policies.

**Acceptance:** one frozen policy is evaluated on sealed families without task-specific adaptation; its provenance includes total proposal and measurement cost; the result exceeds a declared baseline or the negative outcome is retained. Every promoted policy has a deterministic fallback.

Magellan is the primary guide for the output artifact; MLGO and MLCompilerBridge guide the compiler/learner boundary. The implementation need not reproduce their private workloads to test the mechanism on Kiln. [[R02](https://arxiv.org/abs/2601.21096), [R22](https://arxiv.org/abs/2101.04808), [R23](https://research.google/blog/mlgo-a-machine-learning-framework-for-compiler-optimization/), [R24](https://arxiv.org/abs/2311.10800)]

## Milestone 4: implement a small transformation language

**Implement:** checked handles/cursors, primitive actions, structured matching, failure semantics, bounded repetition, serialization, and replay. Begin with existing fusion and simplification operations, then add selective fusion as an independently tested primitive.

**Acceptance:** encode/decode/replay preserves behavior and selection; stale references fail diagnostically; rejected transformations leave the original IR intact; every action records invalidated analyses; replay is deterministic under a pinned environment. The system can explain why a precondition was not established.

This is the point at which Exo 2, MLIR Transform, and Little Dragon become implementation guides rather than reading material. A trace is not yet a reusable strategy: parameterization and matching must generalize beyond transient node identifiers. [[R03](https://arxiv.org/html/2610.20980), [R05](https://arxiv.org/abs/2411.07211), [R06](https://arxiv.org/abs/2409.03864), [R07](https://mlir.llvm.org/docs/Dialects/Transform/)]

## Milestone 5: learn reusable strategies and mine new rules

**Implement:** collect successful and failed transformation traces, cluster by structural pattern, propose parameterized strategies, and validate their preconditions. Introduce counterexample-guided rule synthesis in a small exact domain such as bounded index arithmetic before floating-point GPU scheduling.

**Acceptance:** a strategy applies across unseen graphs; its applicability boundary is explicit; invalid instances are rejected; all counterexamples become tests. A new exact rewrite has a checker-supported argument in its declared theory, or remains labeled empirical and experimental.

Only after this should a broad equality-saturation subsystem become a priority. Start by proving that one domain and one extraction objective deliver useful transformations. Ruler, Souper, and guided equality saturation suggest methods, not a reason to abandon a functioning direct rewrite pipeline. [[R11](https://arxiv.org/abs/2108.10436), [R13](https://arxiv.org/abs/2111.13040), [R27](https://arxiv.org/abs/1711.04422)]

## Milestone 6: improve the discovery process itself

**Implement:** evaluate alternative search policies, memory schemas, cost models, and candidate grammars on new optimization tasks. Freeze the deployed compiler and evaluator for each comparison. Keep the discovery budget multidimensional: GPU time, compilation time, model tokens, and human review.

**Acceptance:** the improved discovery system finds better generalizing compiler artifacts at the same total budget on a held-out task set. Demonstrate more than one generation and report plateaus or regressions. Improved runtime alone is not sufficient evidence of improved meta-optimization.

The progression is intentionally incremental. A failed milestone should identify whether the limitation is semantic coverage, representation, search, evaluation noise, or lack of performance headroom—not trigger a wholesale framework rewrite.

# Resources, tools, and an affordable research configuration

## Separate functional needs from paper-scale replication

The first compiler-policy study needs a CPU environment for graph generation, compilation orchestration, and analysis; an isolated compatible NVIDIA device for CUDA correctness/timing; storage for immutable artifacts; and optionally an LLM endpoint for proposals. A browser workbench is valuable for inspection but should not be the only experiment runner.

An A30-class environment matching the paper matters for reproducing PassNet's reported performance, not for testing whether Kiln's fusion policy can be improved on a different documented device. A simulator can support development and hypothesis generation, but cannot replace hardware measurements when the claim concerns CUDA performance. [R01; K01]

Large-scale model training is a separate resource tier. CUDA Agent's reported 128 H20 devices describe a sandbox execution pool, not a complete statement of its training hardware budget. Little Dragon's model/data pipeline is also substantially more ambitious than a local heuristic search. Do not turn those configurations into a claimed minimum for Kiln. [[R03](https://arxiv.org/html/2610.20980), [R42](https://arxiv.org/abs/2602.24286), [R62](https://cuda-agent.github.io/)]

## Proposed tool stack

| Function | Initial choice | Reason and boundary |
|---|---|---|
| Compiler control plane | Existing Kiln Node/TypeScript workspace | Preserve working IRs and browser compatibility |
| External workload ingestion | Python/PyTorch adapter | Match PassBench's native environment |
| Code generation | Existing CUDA backend first | Avoid confounding policy changes with a backend replacement |
| Transformation language | Small Kiln interpreter; MLIR/Exo concepts | Establish contracts and replay before migration |
| Learning | Sweeps and trees before LLM/RL | Expose baseline headroom cheaply |
| Correctness | Reference tests, structural checks, sanitizers | Immediate practical assurance; scoped formal checks later |
| Evidence | Existing evidence package plus immutable blobs | Reuse identity/statistics surfaces after auditing them |
| Profiling | Selective GPU profiling after a reproducible regression | Avoid collecting expensive counters for every candidate |
| Interchange experiment | xDSL or an MLIR subprocess | Test reuse without replacing the JavaScript core |

These are implementation recommendations. Package versions, hardware support, and licenses must be pinned when adopted. The inspected literature establishes architectural capabilities, not compatibility of every tool in one environment. [R05–R08, R24–R25, R48–R49, R73; K01–K08]

## Budget the experiment rather than guessing a cloud bill

Let $N_c$ be candidate policies, $N_w$ evaluated workloads, $p_f$ the fraction surviving cheap filters, and $t_e$ the average end-to-end evaluation cost. A first approximation is

$$
T_{\mathrm{eval}} \approx N_c N_w p_f t_e.
$$

Add proposal cost, compilation cache misses, confirmation runs, and sanitizer time separately. Compilation and GPU evaluation can have different bottlenecks, so worker counts should follow measured stage utilization.

As an **illustrative design**, 40 policies evaluated on 100 development workloads create up to 4,000 policy/workload evaluations before filtering and caching. This is not a runtime or price estimate. A pilot should measure the per-stage costs before selecting a larger search budget. Use a small screening set, then expand promising candidates, but preserve a separate final evaluation set.

Deduplicate generated implementations as well as policies: different policies can produce identical kernels. Reuse correctness evidence only when the full relevant identity and environment assumptions match. Reuse timing cautiously because runtime conditions can change even when the binary does not.

The break-even calculation also matters. If compilation takes an additional $\Delta C$ seconds and saves $\Delta t$ seconds per invocation, the direct runtime break-even is

$$
N_{\mathrm{break-even}} = \frac{\Delta C}{\Delta t},\qquad \Delta t>0.
$$

This deliberately simple model ignores deployment and engineering costs, but prevents treating an expensive per-shape search as universally attractive. Reusable compiler policies are appealing partly because their discovery cost can be amortized across many future compilations.

# Reading curriculum tied to implementation

The goal is not to read every compiler textbook before writing code. Each reading block should produce an implementation exercise and a testable artifact. The book recommendations below are grounded in publisher/author records; this study does not claim a cover-to-cover reading of every title.

## Block A: conventional compiler mechanics

Read **Cooper and Torczon, Engineering a Compiler, third edition** for IR design, dataflow, dependence reasoning, optimization, and backend organization. Read the original **MLIR** paper alongside it to compare conventional pass organization with extensible dialect infrastructure. [[R50](https://shop.elsevier.com/books/engineering-a-compiler/cooper/978-0-12-815412-0), [R48](https://arxiv.org/abs/2002.11054)]

**Exercise:** write a verifier for Kiln's existing graph representation and a pass contract that declares required facts and invalidations. Add deliberately malformed graphs. The deliverable is an error-reporting system that catches invalid operands, cycles where prohibited, and stale analyses—not a new language frontend.

## Block B: analyses and semantic contracts

Use **Nielson, Nielson, and Hankin, Principles of Program Analysis** for dataflow equations, abstract interpretation, constraints, and type/effect reasoning. Study **Verified Tensor-Program Optimization via High-Level Scheduling Rewrites** to see what a scoped tensor-correctness argument requires. [[R51](https://link.springer.com/book/10.1007/978-3-662-03811-6), [R10](https://adam.chlipala.net/papers/AtlPOPL22/)]

**Exercise:** implement intervals plus divisibility facts for index expressions. Prove or conservatively reject the side conditions needed to lower floor division into target integer division. Make the query result distinguish proven, disproven, and unknown. Exercise analysis invalidation after a rewrite.

A useful second exercise is uniformity reasoning for a restricted control-flow language. Do not infer that uniformity alone proves all GPU synchronization behavior; it is one ingredient in a larger model.

## Block C: rewriting and synthesis

Read **Baader and Nipkow, Term Rewriting and All That**, then **egg**, **Ruler**, and **Souper**. Use **Gulwani, Polozov, and Singh, Program Synthesis** for the synthesis problem and search/verification separation. [[R52](https://www.proof.cit.tum.de/~nipkow/TRaAT/), [R79](https://arxiv.org/abs/2004.03082), [R11](https://arxiv.org/abs/2108.10436), [R27](https://arxiv.org/abs/1711.04422), [R54](https://www.microsoft.com/en-us/research/publication/program-synthesis/)]

**Exercise:** define a small bitvector or bounded-index language; enumerate candidate rules; reject them with counterexamples; retain accepted rules with explicit assumptions. Compare directed rewriting against equality saturation on this domain. Measure graph growth and extraction cost, not just the number of discovered equalities.

The conceptual distinction to retain is between a semantic equality, a rewrite orientation, a scheduling strategy, and a cost model. These can be improved independently and should not be collapsed into one opaque “optimization rule.”

## Block D: schedule languages and specialization

Read **Halide**, **Exocompilation**, **Exo 2**, **MLIR Transform**, and **Reinking's dissertation**. Then read **Jones, Gomard, and Sestoft, Partial Evaluation and Automatic Program Generation** to understand specialization and classical compiler-generation ideas. [[R77](https://dspace.mit.edu/entities/publication/a1eb8c3a-91fe-40d7-978d-16b31cf11178), [R78](https://dspace.mit.edu/entities/publication/39dac616-5dbb-4ad8-90fc-0f255e6e4900), [R05](https://arxiv.org/abs/2411.07211), [R06](https://arxiv.org/abs/2409.03864), [R07](https://mlir.llvm.org/docs/Dialects/Transform/), [R57](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2022/EECS-2022-271.html), [R53](https://studwww.itu.dk/people/sestoft/pebook/)]

**Exercise:** represent one optimization strategy as a parameterized program over checked actions. Specialize it for a target class and a shape family. Serialize and replay the result. Compare hardcoded node references with structural matching and cursor-based selection.

This exercise makes “meta compiler” concrete: some compiler behavior becomes an ordinary program that can be analyzed, specialized, generated, tested, and optimized. It does not require claiming that every aspect of compilation can be reduced to one universal IR.

## Block E: numerical and GPU semantics

Use **Higham, Accuracy and Stability of Numerical Algorithms, second edition** for numerical error reasoning, and **Hwu, Kirk, and El Hajj, Programming Massively Parallel Processors, fourth edition** for an established GPU-programming foundation. The cited fourth edition is a useful reference, not a claim that it is the latest edition. Add current hardware/tool documentation when implementing target-specific features. [[R55](https://epubs.siam.org/doi/10.1137/1.9780898718027), [R56](https://shop.elsevier.com/books/programming-massively-parallel-processors/hwu/978-0-323-91231-0), [R73](https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html)]

**Exercise:** define strict and relaxed numerical modes for a reduction. Construct adversarial inputs, compare reduction orders and fused operations, and document which transformations are legal under each contract. Later examine Kuiper for a verification-oriented treatment of GPU resources and layouts. [[R74](https://pldi26.sigplan.org/details/pldi-2026-papers/37/Kuiper-Correct-and-Efficient-GPU-Programming-with-Dependent-Types-and-Separation-Log), [R75](https://github.com/FStarLang/kuiper)]

## Block F: learned optimization and experiment design

Read **MLGO**, **Magellan**, **Little Dragon**, and **PassNet** together; they change different compiler objects. Add **Kalibera and Jones** for benchmarking methodology and **KernelBench-Verified** for evaluation failure modes. [[R22](https://arxiv.org/abs/2101.04808), [R02](https://arxiv.org/abs/2601.21096), [R03](https://arxiv.org/html/2610.20980), [R01](https://arxiv.org/abs/2605.29357), [R80](https://kar.kent.ac.uk/33611/), [R32](https://arxiv.org/html/2607.16241)]

**Exercise:** synthesize a fusion policy, freeze it, and evaluate on unseen graph families. Compare it with a threshold sweep at equal evaluation cost. Produce a report in which correctness, coverage, kernel latency, invocation latency, and discovery cost are separate columns.

This last exercise is the minimum credible research demonstration of the proposed system. Reading only the LLM papers without the earlier semantic and compiler blocks would leave its most important failure modes unaddressed.

# Research opportunities and the limits of the claim

## Where a defensible contribution could lie

“An LLM writes a pass” and “an LLM improves a heuristic” already have close precedents. A stronger Kiln contribution would combine a representation-level advance with a measurable generalization result. [[R01](https://arxiv.org/abs/2605.29357), [R02](https://arxiv.org/abs/2601.21096), [R03](https://arxiv.org/html/2610.20980), [R04](https://arxiv.org/abs/2607.02684)]

One promising contribution is a **typed transformation-and-policy interface across several compiler levels**, with durable replay and explicit legality evidence. Evaluate whether it reduces invalid proposals and search cost compared with unrestricted source editing, rather than merely asserting that a DSL is easier for a model.

A second is **trace-to-pass distillation**: infer a parameterized transformation from several successful task-specific traces, synthesize its applicability conditions, and show that it improves new graph families. The hard part is finding the correct generalization boundary; structural resemblance is not semantic equivalence.

A third is **counterexample-guided growth of the compiler's reasoning abilities**. When a profitable rewrite is repeatedly rejected because an analysis cannot establish a fact, propose an analysis improvement rather than relaxing the guard. Check the analysis's soundness independently. This moves optimization from exploiting existing legality knowledge to expanding what the compiler can legitimately establish.

A fourth is **multi-level profitability with evidence transport**: connect graph-level choices to schedule-level outcomes while preserving uncertainty. Cleave and Mirage motivate decomposition, but Kiln could contribute a transparent mechanism for learning which higher-level transformations deserve expensive lower-level evaluation. [[R16](https://www.usenix.org/conference/osdi25/presentation/wu-mengdi), [R17](https://arxiv.org/abs/2610.07742)]

Finally, there is **budget-normalized meta-optimization**: optimize the policy generator or search program, then test whether it discovers better compiler artifacts on new tasks. This is a more demanding benchmark than reporting the best kernel from a larger search.

## A rigorous recursive-improvement experiment

Let $A_t$ be the discovery procedure and $C_t$ the deployed compiler. A generation produces candidate changes to either object. Test changes to $C_t$ with a fixed discovery budget and unseen compilation workloads. Test changes to $A_t$ with a fixed starting compiler and unseen optimization problems.

After accepting an update, retain the old pair and cross-evaluate. This separates a better optimizer from an easier task distribution or a compiler that merely exposes more low-hanging opportunities. Report the learning curve over total compute, not just iteration number.

A genuine positive result would be repeated improvement in future discovery efficiency or quality under those controls. It could arise from better feature extraction, more useful primitives, improved cost models, or a smaller search grammar. It need not involve changing model weights, and it does not establish unbounded improvement or general intelligence.

The most important engineering safeguard is also the most important scientific safeguard: the system proposing changes must not silently redefine what counts as correctness or success.

## What should not be the initial project

Do not start by training a large model, replacing Kiln's whole IR with LLVM, implementing every Tensor Core primitive, migrating all numerical semantics into a proof assistant, or constructing a general autonomous repository editor. Each can be a worthwhile later branch, but none is necessary to answer the first research question.

Do not collect a huge unstructured archive of optimization conversations and call it compiler knowledge. The reusable unit should carry a match domain, action or policy, dependencies, evidence, and applicability limitations. Failed attempts and counterexamples are as important as successful snippets.

Do not claim novelty from the word “recursive.” The contribution has to be an artifact, algorithm, semantic interface, dataset, or experimentally established capability.

# Final recommendation

Make Kiln's next major abstraction a **compiler optimization artifact**: a typed, versioned object that specifies where it applies, what it changes, what it requires, what it invalidates, and what evidence supports its use.

Keep the existing compiler operational. Expose the fusion decision first. Establish a credible evaluator and identity scheme. Let inexpensive search find the baseline headroom. Then let an LLM synthesize compact policies, followed by strategies composed from checked transformations. Use counterexamples and formal tools selectively to expand the trustworthy transformation library.

The resulting framework would join three capabilities that are often developed separately: a programmable compiler, a language for compiler optimization, and an empirical process for improving that language's programs. Its defining result should be **better compilation of unseen workloads with less repeated optimization effort**, not a collection of impressive but isolated kernels.

The research supports this direction strongly enough to justify implementation. It does not establish that Kiln already has the necessary semantics, that every published artifact is reproducible, or that larger search budgets will keep producing gains. The proposed milestones make those uncertainties testable rather than hiding them.

# Artifact availability and reproduction boundaries

Availability is a separate axis from scientific relevance. The table records what this study established, not a guarantee that every build instruction still works.

| Work | What was established | Reproduction consequence |
|---|---|---|
| PassNet | Public paper; inspected pass interface and scorer at a known commit | Start here for an external benchmark; reconcile settings first |
| Magellan | Paper and architecture; production workload constraints | Reproduce the method on Kiln's own open corpus, not the private result |
| Little Dragon | Detailed methods; linked repository README only minimally informative | Do not promise complete model-training reproduction from that README |
| Exo / Exo 2 | Papers and public project/artifact lineage | Prototype an action/query/reference interface and compare one scheduling family |
| Ruler | Paper and archived artifact | Good candidate for a small exact-domain rule-discovery experiment |
| MLCompilerBridge | Paper and archived artifact | Study the compiler/learner boundary before reimplementing it |
| Kuiper | Paper record and source README, including admitted-proof warning | Audit exact modules and assumptions before relying on proof guarantees |
| GPU-agent papers | Heterogeneous toolchains, targets and release scopes | Reuse mechanisms; independently audit code/data/model availability |

These conclusions draw on the primary records and artifact checks cited in the bibliography. Public code, public data, public model weights, complete environments, and exact experiment configurations are five different release properties. [[R01](https://arxiv.org/abs/2605.29357), [R02](https://arxiv.org/abs/2601.21096), [R03](https://arxiv.org/html/2610.20980), [R04](https://arxiv.org/abs/2607.02684), [R05](https://arxiv.org/abs/2411.07211), [R24](https://arxiv.org/abs/2311.10800), [R58](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/README.md), [R59](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/aggregate_es_scores.py), [R60](https://github.com/PaddlePaddle/PassNet/commit/61c64709f6d324216ae8252cec3cdc35b2dd5da5), [R61](https://github.com/Anna-Bele/How-To-Train-Your-Little-Dragon), [R62](https://cuda-agent.github.io/), [R63](https://tvm.apache.org/docs/deep_dive/tensor_ir/learning.html), [R64](https://zenodo.org/records/5459312), [R65](https://zenodo.org/records/10574579), [R74](https://pldi26.sigplan.org/details/pldi-2026-papers/37/Kuiper-Correct-and-Efficient-GPU-Programming-with-Dependent-Types-and-Separation-Log), [R75](https://github.com/FStarLang/kuiper)]

# Local source provenance

The local references below identify the uploaded snapshots used for this study. Paths are relative to the named extracted archive root. Line ranges refer to the inspected files. SHA-256 hashes identify file contents; they do not certify correctness. No repository-wide build or CUDA execution is claimed.

## K01 — Kiln architecture and workspace requirements

Repository description of the six-stage tensor/GPU stack, workbench and execution layout. This is source documentation, not a runtime validation.

Archive root: `kiln`.

Source: `README.md`; lines **3–40**.

SHA-256: `b109ea07f906a40e5ad873659dad5976394d796a41c96c984f5f5881f9440e36`.

## K02 — Rule, pass, pipeline and prerequisite interfaces

Actual Rule/Pass/Pipeline methods. Rule.requires checks names in the rewrite history; it is not already a typed analysis dependency graph.

Archive root: `kiln`.

Source: `packages/kiln/src/core/kiln.js`; lines **622–749; 929–932**.

SHA-256: `a9bd1509401f96c70d131b451023cb2067bb58d16e2fe580bac99365787fd7bc`.

## K03 — Current loop-fusion algorithm and profitability guard

Producer inlining into consumers; approximate work guard at 1.02; reverse-order fusion pass. This is the initial meta-optimization target.

Archive root: `kiln`.

Source: `packages/kiln/src/std/loop.js`; lines **299–345**.

SHA-256: `22d26f26df1fcc078442a57830dac69a7b358ccada0757baa358e3b43675a1b7`.

## K04 — Numerical and index semantic boundaries

Reference versus emitted numerical spellings and index division/remainder. Audit targets require supported-domain analysis; not blanket bug claims.

Archive root: `kiln`.

Source: `packages/kiln/src/std/fns.js`; lines **4–26**.

SHA-256: `c52ce0c01728ed8d1b7aa137265d9c5e910975247a1c33cf35256d833d006a5a`.

Source: `packages/kiln/src/core/ix.js`; lines **145–155; 189–200**.

SHA-256: `d010f82b4f8c48991bdd7f6479166e7269955256577002e303f99d0c5686a316`.

## K05 — Strata workbench pass contracts and lowering boundary

Requirements/provided facts/invalidations and textual LLVM structural checks. The file explicitly distinguishes unchecked assumptions from real runtime guards.

Archive root: `strata-workspace-full`.

Source: `wb/src/core/80-pipeline.js`; lines **17–35; 49–60; 66–97; 115–125**.

SHA-256: `6e6c6e44833951d48f6af9a6b1fd7918fab0f576e2f75d9f87fb952c7e09d41b`.

## K06 — Strata API design status

Explicitly examples only, not an implemented API. Useful design constraints and acceptance-test ideas.

Archive root: `strata-workspace-full`.

Source: `strata-api/README.md`; lines **1–38**.

SHA-256: `5630cf4f8ceb6d9c176cfd6f7e948284500be6bceeab180b67a920729f5fca3f`.

## K07 — Kiln–PassNet starter validation limits

The supplied prototype records CPU syntax/import checks only, unsupported workload classes, and untested CUDA/PassBench execution. Those checks were not rerun in this study.

Archive root: `kiln-passnet-starter/kiln-passnet-starter`.

Source: `README.md`; lines **1–3; 33–60**.

SHA-256: `8fe335b73d4eee2bd5a64a87c76a65aff3edc00f4c879efb311e475a9f0ec637`.

## K08 — Existing evidence-library extension surface

Exports for provenance, statistics, protocol, identities, records and verdicts; content-ID schema inspected. Not an exhaustive audit of statistical or identity correctness.

Archive root: `kiln`.

Source: `packages/evidence/src/index.ts`; lines **1–15**.

SHA-256: `7be21e94d572a80fbef3c3c8afea7d00a29d098ff6516c7c288b49508b72e93b`.

Source: `packages/evidence/src/identity.ts`; lines **1–60**.

SHA-256: `2e29501f941a0df3146a3755c0bc3728dc8b6ca0f1ec78234b2e3caba39c6732`.

## Uploaded archive identities

**kiln.zip** — 3,726,537 bytes.

SHA-256: `3d5b329682921cf6d65ea75e3042fb8d9afe0d8d982b6162ccc25080a350e8a9`.

**strata-workspace-full.zip** — 18,853,509 bytes.

SHA-256: `17ce9206f57d1c92da60a406d836ddd2e35f846470404be65aff4b3e9756954e`.

**kiln-passnet-starter.zip** — 13,618 bytes.

SHA-256: `e89c7fddbc2a49adc427d657f6b2ba1a8b898de5783a6d44d3d8a765f9aa8494`.

# Annotated references

References are organized by the study's research sequence rather than alphabetically. Each entry records the kind of evidence inspected. A short primary abstract can establish a research direction but does not support the same implementation detail as a full paper or audited source. Access date for live documentation and repositories: October 30, 2026.

**R01. [PassNet: Scaling Large Language Models for Graph Compiler Pass Generation](https://arxiv.org/abs/2605.29357)**. 2026. Preprint. Full HTML; PDF result table inspected; repository interface and scorer audited separately.

**R02. [Magellan: Autonomous Discovery of Novel Compiler Optimization Heuristics with AlphaEvolve](https://arxiv.org/abs/2601.21096)**. 2026. Preprint / C4ML workshop. Full text and PDF architecture page inspected.

**R03. [How to Train Your Little Dragon: Teaching a Small Language Model to Construct and Refine GPU Optimization Scripts](https://arxiv.org/html/2610.20980)**. 2026-10-14. Preprint. Full HTML, methods, numerical-check definition, split protocol and repository appendix inspected. PDF fetch failed; no PDF-specific claims.

**R04. [Can Coding Agents Implement Missed Compiler Optimizations? Evaluating LLM Agents on LLVM Peephole Optimizations (PeepholeBench)](https://arxiv.org/abs/2607.02684)**. 2026-07-02. Preprint. Primary abstract and author project page; results discussed qualitatively, not a full artifact audit.

**R05. [Exo 2: Growing a Scheduling Language](https://arxiv.org/abs/2411.07211)**. 2025; preprint 2024. ASPLOS paper. Paper and PDF scheduling/cursor material inspected.

**R06. [The MLIR Transform Dialect: Your Compiler Is More Powerful Than You Think](https://arxiv.org/abs/2409.03864)**. 2024. Research paper. Primary paper landing page and abstract.

**R07. [MLIR Transform dialect documentation](https://mlir.llvm.org/docs/Dialects/Transform/)**. Accessed 2026-10-30. Official documentation. Transform operations, handles, effects and failure mechanisms inspected.

**R08. [MLIR PDLL documentation](https://mlir.llvm.org/docs/PDLL/)**. Accessed 2026-10-30. Official documentation. Declarative matching and rewrite infrastructure.

**R09. [ELEVATE: A Language for Describing Optimization Strategies](https://michel-steuwer.github.io/files/publications/2020/arXiv-2020.pdf)**. 2020. Author-hosted paper. Discovery-level record; used for the strategy-language lineage, not numerical claims.

**R10. [Verified Tensor-Program Optimization via High-Level Scheduling Rewrites](https://adam.chlipala.net/papers/AtlPOPL22/)**. 2022. POPL paper. Author and institutional records; guarantee scoped to the formalized tensor language.

**R11. [Rewrite Rule Inference Using Equality Saturation (Ruler)](https://arxiv.org/abs/2108.10436)**. 2021. OOPSLA paper. Primary abstract and archived artifact record.

**R12. [Better Together: Unifying Datalog and Equality Saturation (egglog)](https://arxiv.org/abs/2304.04332)**. 2023. PLDI paper. Primary paper and author publication page.

**R13. [Sketch-Guided Equality Saturation](https://arxiv.org/abs/2111.13040)**. 2021 preprint; later Guided Equality Saturation, POPL 2024. Research paper lineage. Versions distinguished; no numerical claims.

**R14. [Mind the Abstraction Gap: Bringing Equality Saturation to Real-World ML Compilers (Constable)](https://2025.splashcon.org/details/OOPSLA/42/Mind-the-Abstraction-Gap-Bringing-Equality-Saturation-to-Real-World-ML-Compilers)**. 2025. OOPSLA paper. Conference abstract and artifact availability record.

**R15. [TASO: Optimizing Deep Learning Computation with Automatic Generation of Graph Substitutions](https://catalyst.cs.cmu.edu/projects/taso.html)**. 2019. SOSP paper / author project. Primary project record.

**R16. [Mirage: A Multi-Level Superoptimizer for Tensor Programs](https://www.usenix.org/conference/osdi25/presentation/wu-mengdi)**. 2025. OSDI paper. Primary conference abstract and artifact link; no expanded proof claims.

**R17. [Cleave: Scaling Tensor Program Optimization via Decoupled Algebraic Search and Operator Scheduling](https://arxiv.org/abs/2610.07742)**. 2026-10-06. Preprint. PDF text and first-page architecture figure inspected.

**R18. [Tensor Program Optimization with Probabilistic Programs (MetaSchedule)](https://proceedings.neurips.cc/paper_files/paper/2022/hash/e894eafae43e68b4c8dfdacf742bcbf3-Abstract-Conference.html)**. 2022. NeurIPS paper. Primary proceedings record.

**R19. [TensorIR: An Abstraction for Automatic Tensorized Program Optimization](https://arxiv.org/abs/2207.04296)**. 2023; preprint 2022. ASPLOS paper. Primary abstract and TVM documentation.

**R20. [Ansor: Generating High-Performance Tensor Programs for Deep Learning](https://www.usenix.org/conference/osdi20/presentation/zheng)**. 2020. OSDI paper. Primary conference record.

**R21. [Enabling Tensor Language Model to Assist in Generating High-Performance Tensor Programs for Deep Learning](https://www.usenix.org/conference/osdi24/presentation/zhai)**. 2024. OSDI paper. Primary conference record; included as schedule-learning predecessor.

**R22. [MLGO: A Machine Learning Guided Compiler Optimizations Framework](https://arxiv.org/abs/2101.04808)**. 2021. Research paper. Primary abstract and Google Research implementation account.

**R23. [MLGO: a machine learning framework for compiler optimization](https://research.google/blog/mlgo-a-machine-learning-framework-for-compiler-optimization/)**. 2021. Primary engineering account. Production integration context; not an independently reproduced result.

**R24. [The Next 700 ML-Enabled Compiler Optimizations (MLCompilerBridge)](https://arxiv.org/abs/2311.10800)**. 2024; preprint 2023. CC paper. Primary abstract and artifact record.

**R25. [CompilerGym: Robust, Performant Compiler Optimization Environments for AI Research](https://arxiv.org/abs/2109.08267)**. 2022; preprint 2021. CGO paper. Primary abstract; package maintenance not inferred from paper.

**R26. [AutoPhase: Juggling HLS Phase Orderings in Random Forests with Deep Reinforcement Learning](https://proceedings.mlsys.org/paper_files/paper/2020/hash/5b47430e24a5a1f9fe21f0e8eb814131-Abstract.html)**. 2020. MLSys paper. Primary proceedings record; HLS target explicitly distinguished.

**R27. [Souper: A Synthesizing Superoptimizer](https://arxiv.org/abs/1711.04422)**. 2017 preprint. Research paper. Primary abstract and Google Research record.

**R28. [Alive2: Bounded Translation Validation for LLVM](https://web.ist.utl.pt/nuno.lopes/pubs.php?id=alive2-pldi21)**. 2021. PLDI paper. Author and institutional records; boundedness emphasized.

**R29. [LLM-VeriOpt](https://doi.org/10.1109/CGO68049.2026.11395239)**. 2026. CGO paper. Publisher/author discovery record; included without unverified numerical results.

**R30. [Verified Learning for Compiler Optimization: An LLM-Guided Architecture with Formal Control](https://arxiv.org/abs/2609.27214)**. 2026-09. Preprint. Primary HTML; LLVM-level validation, not arbitrary CUDA proof.

**R31. [KernelBench: Can LLMs Write Efficient GPU Kernels?](https://arxiv.org/abs/2502.10517)**. 2025. Research benchmark paper. Primary abstract.

**R32. [KernelBench-Verified](https://arxiv.org/html/2607.16241)**. 2026. Research benchmark paper. Full HTML; hidden tests, precision baseline, single-turn scope.

**R33. [FastKernels: Benchmarking GPU Kernel Generation in Production](https://fastkernels.github.io/)**. 2026. Author project / preprint. Primary project record; arXiv:2605.23215.

**R34. [FlashInfer-Bench: Building the Virtuous Cycle for AI-driven LLM Systems](https://proceedings.mlsys.org/paper_files/paper/2026/hash/37e44c4b5321605735be9761f9b758fc-Abstract-Conference.html)**. 2026. MLSys paper. Primary proceedings and official project records.

**R35. [KernelOPT: Dispatch-Aware Agentic Search for GPU Kernel Optimization](https://arxiv.org/abs/2609.30059)**. 2026-09-24. Preprint. Primary abstract; model-level gate and fallback claims attributed to authors.

**R36. [KernelAgent: Hardware-Guided GPU Kernel Optimization via Multi-Agent Orchestration](https://pytorch.org/blog/kernelagent-hardware-guided-gpu-kernel-optimization-via-multi-agent-orchestration/)**. 2026-03-06. Primary engineering account. Official PyTorch account; scope is generated Triton kernels.

**R37. [KernelFoundry: Hardware-Aware Evolutionary GPU Kernel Optimization](https://proceedings.mlr.press/v306/wiedemann26a.html)**. 2026. ICML paper. Primary proceedings abstract; SYCL and CUDA distinguished.

**R38. [AccelOpt: A Self-Improving LLM Agentic System for AI Accelerator Kernel Optimization](https://proceedings.mlsys.org/paper_files/paper/2026/hash/0f8426558905746fc38da5e335700aec-Abstract-Conference.html)**. 2026. MLSys paper. Primary proceedings record; AWS Trainium target.

**R39. [KernelBlaster: Continual Cross-Task CUDA Optimization via Memory-Augmented In-Context Reinforcement Learning](https://arxiv.org/abs/2602.14293)**. 2026. Preprint. Primary abstract, author lab page and code availability; HTML fetch failed.

**R40. [KernelEvolve: Scaling Agentic Kernel Coding for Heterogeneous AI Accelerators at Meta](https://arxiv.org/abs/2512.23236)**. 2025–2026. Technical report. Full HTML retrieved; preprint originated Dec 2025, later 2026 revisions.

**R41. [KernelEvolve: how Meta’s ranking engineer agent optimizes AI infrastructure](https://engineering.fb.com/2026/04/02/developer-tools/kernelevolve-how-metas-ranking-engineer-agent-optimizes-ai-infrastructure/)**. 2026-04-02. Primary engineering account. Production results not treated as publicly reproduced macrobenchmarks.

**R42. [CUDA Agent: Large-Scale Agentic RL for High-Performance CUDA Kernel Generation](https://arxiv.org/abs/2602.24286)**. 2026. Preprint. PDF and project page inspected; sandbox pool distinguished from model-training cluster.

**R43. [Towards Robust Agentic CUDA Kernel Benchmarking, Verification, and Optimization](https://arxiv.org/abs/2509.14279)**. 2025. Preprint. Primary abstract and author artifact record; API cost numbers not repeated without full protocol audit.

**R44. [Beyond Scaling: Self-Evolving LLM Agents for Hardware Kernel Optimization via an Experience-Driven Workflow and Experience Graph Memory (KOPE)](https://arxiv.org/abs/2608.25570)**. 2026-08. Preprint. Primary abstract; Ascend target and external-memory interpretation.

**R45. [CUDAnalyst: Towards Feedback-to-Plan Decisions for Self-Evolving LLM Agents in CUDA Kernel Generation](https://proceedings.mlr.press/v306/chong26b.html)**. 2026. ICML paper. Primary proceedings record; attribution methodology.

**R46. [HintPilot](https://aclanthology.org/2026.findings-acl.1251/)**. 2026. ACL Findings paper. Primary proceedings record; compiler-hint intervention, not general pass synthesis.

**R47. [CompilerGPT: leveraging large language models for analyzing and acting on compiler optimization reports](https://computing.llnl.gov/casc/newsletter/vol-18)**. 2025; institutional account 2026. Primary institutional account. LLNL report summarizes the ISC 2025 paper, DOI 10.1007/978-3-032-07612-0_25.

**R48. [MLIR: A Compiler Infrastructure for the End of Moore’s Law](https://arxiv.org/abs/2002.11054)**. 2020. CGO paper. Primary paper record.

**R49. [xDSL documentation: MLIR interoperation](https://docs.xdsl.dev/guides/mlir_interoperation/)**. Accessed 2026-10-30. Official documentation. Python prototyping and version-sensitive MLIR interoperability.

**R50. [Engineering a Compiler, third edition — Keith Cooper and Linda Torczon](https://shop.elsevier.com/books/engineering-a-compiler/cooper/978-0-12-815412-0)**. 2022. Textbook. Publisher description/metadata; not claimed to have read the entire book in this session.

**R51. [Principles of Program Analysis — Flemming Nielson, Hanne Riis Nielson and Chris Hankin](https://link.springer.com/book/10.1007/978-3-662-03811-6)**. 1999. Textbook. Publisher and author-institution metadata; curriculum recommendation.

**R52. [Term Rewriting and All That — Franz Baader and Tobias Nipkow](https://www.proof.cit.tum.de/~nipkow/TRaAT/)**. 1998. Textbook. Author and publisher records; curriculum recommendation.

**R53. [Partial Evaluation and Automatic Program Generation — Neil D. Jones, Carsten K. Gomard and Peter Sestoft](https://studwww.itu.dk/people/sestoft/pebook/)**. 1993. Textbook. Author book site and table of contents.

**R54. [Program Synthesis — Sumit Gulwani, Oleksandr Polozov and Rishabh Singh](https://www.microsoft.com/en-us/research/publication/program-synthesis/)**. 2017. Research monograph. Author institutional abstract; DOI 10.1561/2500000010.

**R55. [Accuracy and Stability of Numerical Algorithms, second edition — Nicholas J. Higham](https://epubs.siam.org/doi/10.1137/1.9780898718027)**. 2002. Textbook. Publisher, author and relevant chapter records.

**R56. [Programming Massively Parallel Processors, fourth edition — Wen-mei Hwu, David Kirk and Izzat El Hajj](https://shop.elsevier.com/books/programming-massively-parallel-processors/hwu/978-0-323-91231-0)**. 2022. Textbook. Publisher TOC inspected. Cited edition is deliberate, not claimed to be latest.

**R57. [The Design and Implementation of User-Schedulable Languages — Alexander Reinking](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2022/EECS-2022-271.html)**. 2022. Doctoral thesis. Author institution abstract and metadata; not a complete thesis reading.

**R58. [PassNet PassBench README, pinned source snapshot](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/README.md)**. 2026 snapshot. Source code documentation. Fetched through GitHub connector. Blob `5e1c9d78ba373984864c2d1df45915739aa7026c`.

**R59. [PassNet aggregate_es_scores.py, pinned source snapshot](https://github.com/PaddlePaddle/PassNet/blob/61c64709f6d324216ae8252cec3cdc35b2dd5da5/pass_bench/aggregate_es_scores.py)**. 2026 snapshot. Executable source. Fetched through GitHub connector. Blob `21b34fd1e90ca388f248e4ac1ecc38dcfcdc20bd`; p default 0.0.

**R60. [PassNet observed develop-branch commit](https://github.com/PaddlePaddle/PassNet/commit/61c64709f6d324216ae8252cec3cdc35b2dd5da5)**. 2026-06-01. Repository snapshot. Observed through GitHub API on study date; not established as authors’ exact experiment commit.

**R61. [Little Dragon accompanying repository](https://github.com/Anna-Bele/How-To-Train-Your-Little-Dragon)**. Accessed 2026-10-30. Author artifact. README fetched; one-sentence description is insufficient to establish complete training reproducibility.

**R62. [CUDA Agent project and released task dataset](https://cuda-agent.github.io/)**. 2026. Author project. Pipeline, task filtering, tools and public release scope inspected.

**R63. [TVM TensorIR learning guide](https://tvm.apache.org/docs/deep_dive/tensor_ir/learning.html)**. Accessed 2026-10-30. Official documentation. IR abstraction reference; not a guarantee of current cross-version compatibility.

**R64. [Ruler archived research artifact](https://zenodo.org/records/5459312)**. 2021. Archived artifact. Provides a stable artifact entry for reproduction planning.

**R65. [MLCompilerBridge archived research artifact](https://zenodo.org/records/10574579)**. 2024. Archived artifact. Stable artifact entry for the compiler/learning boundary.

**R66. [The New Compiler Stack: A Survey on the Synergy of LLMs and Compilers](https://arxiv.org/html/2601.02045)**. 2026. Survey / discovery aid. Used to find primary sources, not as sole support for individual result claims.

**R67. [Astra: A Multi-Agent System for GPU Kernel Performance Optimization](https://arxiv.org/abs/2509.07506)**. 2025. Preprint. Primary abstract; optimization of existing SGLang CUDA kernels. Submitted September 9; revised December 2, 2025.

**R68. [Autocomp: LLM-Driven Code Optimization for Tensor Accelerators](https://arxiv.org/abs/2505.18574)**. 2025. Research paper. Primary full text; structured planning, optimization menus, hardware feedback and schedule reuse. Do not mix hardware/results across versions.

**R69. [ReEvo: Large Language Models as Hyper-Heuristics with Reflective Evolution](https://papers.nips.cc/paper/2024/hash/4ced59d480e07d290b6f29fc8798f195-Abstract-Conference.html)**. 2024. NeurIPS paper. Primary proceedings abstract and author project record; heuristic-generation lineage.

**R70. [Mathematical discoveries from program search with large language models (FunSearch)](https://doi.org/10.1038/s41586-023-06924-6)**. Online 2023; volume 2024. Nature paper. Primary record and author account; fixed evaluator and program-space evolutionary search. Publisher full-page fetch was restricted.

**R71. [AlphaEvolve: A coding agent for scientific and algorithmic discovery](https://arxiv.org/abs/2506.13131)**. 2025. Technical report / primary project account. Primary abstract and DeepMind announcement; general evolutionary coding framework, not independently reproduced here.

**R72. [The Design and Implementation of a Verification Technique for GPU Kernels (GPUVerify)](https://doi.org/10.1145/2743017)**. 2015. TOPLAS paper. Primary record; race and barrier-divergence checking on supported GPU programs, not unrestricted functional correctness.

**R73. [NVIDIA Compute Sanitizer documentation](https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html)**. Accessed 2026-10-30. Official documentation. Tool purposes and error-exitcode option inspected. Dynamic checking, not a universal proof.

**R74. [Kuiper: Correct and Efficient GPU Programming with Dependent Types and Separation Logic](https://pldi26.sigplan.org/details/pldi-2026-papers/37/Kuiper-Correct-and-Efficient-GPU-Programming-with-Dependent-Types-and-Separation-Log)**. 2026. PLDI paper. Primary conference record; related source README audited. DOI: 10.1145/3808280.

**R75. [Kuiper repository README](https://github.com/FStarLang/kuiper)**. Accessed 2026-10-30. Author source artifact. Fetched through GitHub connector. README blob `034e38a33a4334a16f25f3e3fea24b0863830ebc`. Explicit warning about admitted proofs in work-in-progress modules.

**R76. [The Next Frontier for AI-Generated Kernels: Correctness](https://pldi26.sigplan.org/details/page-2026-papers/4/The-Next-Frontier-for-AI-Generated-Kernels-Correctness)**. 2026. PAgE workshop paper. Primary conference record; a verification-oriented research lead, not a complete artifact audit.

**R77. [Halide: A Language and Compiler for Optimizing Parallelism, Locality, and Recomputation in Image Processing Pipelines](https://dspace.mit.edu/entities/publication/a1eb8c3a-91fe-40d7-978d-16b31cf11178)**. 2013. PLDI paper. Primary institutional abstract; algorithm/schedule separation and locality-parallelism-recomputation tradeoff.

**R78. [Exocompilation for Productive Programming of Hardware Accelerators](https://dspace.mit.edu/entities/publication/39dac616-5dbb-4ad8-90fc-0f255e6e4900)**. 2022. PLDI paper. Primary institutional and conference records; user-level target support and scheduling.

**R79. [egg: Fast and Extensible Equality Saturation](https://arxiv.org/abs/2004.03082)**. 2021; preprint 2020. POPL paper. Primary abstract and author/SIGPLAN account; e-class analyses and rebuilding.

**R80. [Rigorous Benchmarking in Reasonable Time — Tomas Kalibera and Richard Jones](https://kar.kent.ac.uk/33611/)**. 2013. ISMM paper. Primary institutional record and author account; multiple sources of measurement variation. Proposed study protocol is this report’s design.

**R81. [eqsat: An Equality Saturation Dialect for Non-destructive Rewriting](https://arxiv.org/abs/2505.09363)**. 2025. Research preprint. Primary abstract; candidate direction for representing equality alternatives inside compiler IR, not a completed port.

