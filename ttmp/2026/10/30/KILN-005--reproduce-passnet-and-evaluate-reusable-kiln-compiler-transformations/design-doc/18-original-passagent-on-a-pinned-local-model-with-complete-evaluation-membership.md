---
Title: Original PassAgent on a pinned local model with complete evaluation membership
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/367-convert-original-bf16-checkpoint.py
      Note: Unquantized conversion and storage-type gate
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/agent-runtime-bootstrap-v1/agent-image-fidelity-v1.json
      Note: Original source and complete graph membership verification
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T08:25:02.345997986-04:00
WhatFor: ""
WhenToUse: ""
---

# Original PassAgent with a pinned local model and complete evaluation membership

This phase runs the original PassAgent framework and original PassBench evaluation tools with a locally served model. It is separate from Kiln transformation synthesis. A working original-agent trajectory supplies the reference agent behavior needed for the later compiler-versus-specialized-kernel comparison. It does not increase Kiln's accepted benchmark coverage.

## Components and identities

The pinned PassNet checkout is61c64709f6d324216ae8252cec3cdc35b2dd5da5. Its pass_agent agent, runtime, tools and prompts remain original source at this setup gate. R2E-Gym is pinned at0d94c4eb9431cd195c55a7ea3abd54006c9a1735 because the repository requirement otherwise follows unbounded Git HEAD. This pin is a reproducible dependency choice, not proof of the authors' historical installation. Import/runtime compatibility must be verified before running trajectories.

The local OpenAI-compatible endpoint is planned using llama.cpp0ec4027a2a0183de87c007069adddc06e665f7de. Complete pinned source archives, license, build/server/tool-call documentation and extracted review files are stored under sources/agent-runtime-bootstrap-v1. This is serving infrastructure rather than a replacement for PassAgent. The first request must validate its actual tool-call response format before an expensive task run.

## Preserve the original checkpoint before studying the agent

The chosen checkpoint is Qwen/Qwen3-30B-A3B at ad44e777bcd18fa416d9da3bd8f70d33ebb85d39. The original16 safetensors shards total61066575648 bytes. Full required metadata/tokenizer/license files bring the download plan to61084185821 bytes. Every LFS shard is pinned by its published SHA256; ordinary small Git files use their Git blob hash, with observed SHA256 also retained after download.

Use unquantized BF16 GGUF conversion for serving, rather than choosing a smaller or quantized model to make the initial result easier. The converter and output identity must be pinned and the produced tensor types inspected. Original checkpoint identity does not imply identical logits or generation under different serving arithmetic; server backend, prompt template, context, thinking mode and greedy-decoding configuration must be recorded. The paper hardware/software and this DGX runtime differ, so results cannot be called an exact numerical reproduction of the published model score.

## The shipped 200-task file is a different evaluation membership

Direct inspection finds200 unique directories in passbench_demo_dataset_200.jsonl, each containing one graph. None of those directory names occur in the official hf_fusible_eval_samples_v2.txt evaluation list. The latter has200 tasks and2060 graphs. This proves different record membership/cardinality; it does not establish disjoint operator patterns or unrelated models.

A derived agent JSONL now preserves every official evaluation task in its original order. It includes all2060 graph identities, graph-list hashes, original source task paths and no filtering by Kiln support, size or dtype. Dataset selection is an exposed original runner parameter; the agent algorithm is unchanged. The shipped single-task CrossViT example can remain a separate operational smoke test. It must not replace the official full evaluation population.

The derived rows select a dedicated image name, kiln005-passagent:torch26.05. Source fidelity and normal shell startup are now verified; see the setup checkpoints below. Fresh task workspaces must begin with empty generated pass directories so existing example/teacher code does not enter an agent trajectory. Original input/model metadata, integrity checks, reverse-order evaluation, scorer and every failure must remain visible.

## Build and acquisition sequence

Script342 verifies the complete llama.cpp source archive before extracting it. It configures/builds the unmodified source inside the already-used NVIDIA image with CUDA13.2 and CMake3.31.6, targeting GB10 compute architecture121a. The image is resolved to an immutable local ID for all build commands. Only llama-server is requested; tests/examples/app and embedded UI/remote UI fetching are disabled. HTTP serving on the local interface needs no HTTPS library. Source/build hashes and phase return codes are retained.

Script343 downloads the exact frozen checkpoint and tokenizer files to a remote sources directory. It uses explicit public URLs, bounded network retries, validated HTTP ranges for resumable partials, file-size checks and complete content hashes. Receipt updates distinguish pending, downloading, verifying, verified and failed files. It never converts a partial or hash mismatch into a successful checkpoint. Bulk model storage remains under the remote sources/agent-runtime-bootstrap-v1 path, with its byte/hash receipt preserved in the ticket; it is not a giant Git blob.

Both jobs run in separate named tmux sessions with explicit receipts. A pending observation is not a reason to start another job. A terminal failure requires diagnosis and a new preserved recovery step. Model serving/inference starts only after acquisition, conversion and an API/tool-call probe succeed.

## Runtime and measurement isolation

The endpoint is local and requires no commercial credential. No secret values are inspected during acquisition/provisioning. The upstream runner reads environment defaults at startup; before executing it, supply explicit local endpoint/key arguments and document those process settings. A dummy local key is not a credential to any external provider.

Original PassAgent alternates model requests and evaluator feedback. If serving and benchmark execution share the GB10, inference must be idle during each measurement. Memory residency and any sleep/unload protocol must be declared. The server documentation advertises idle sleeping that unloads model/KV storage, but that capability is not yet validated here and must not be assumed. No serving workload should overlap an isolated compiler timing experiment.

## Existing benchmark boundary and open gates

Current accepted Kiln replay remains27/200 complete tasks and338/2060 graphs. Import eligibility1196/69 and native precision discrepancies are separate work. The present setup has not run PassAgent or produced trajectories.

Remaining gates are: complete pinned build/download; unquantized conversion and artifact checks; valid chat/tool responses; compatible R2E-Gym installation; original agent container/workspace/evaluator smoke; fixed-budget trajectories on a declared smoke/ten-task population; full200-task accounting; and comparison with Kiln-native reusable transformation synthesis. Preserve raw failures throughout. Updated reMarkable delivery remains pending the earlier explicit approval request.


## Verified setup checkpoint

The CUDA llama-server build is complete (binary SHA256120e0aa1ff814a42027669f3bc9cb3df03e1d797796c91c129f144a1db95fd57). All25 checkpoint files,61084185821 bytes, have passed the pinned content checks. The independent converter environment passes its upstream CLI import/help gate. Script367 runs the original converter with --outtype bf16, and rejects a final artifact containing storage types other than BF16/F32. Conversion is a separate gate from inference agreement.

The dedicated original-agent image is sha256:e5c039c27c487f6c15b9f2d90bfb4c326d986b2731a2be83eece2e039e231ab6. Fidelity validation checks14876 source files,603 symlinks,201 empty pass directories and all200 tasks/2060 graph metadata paths. Original entry.sh links resolve to the intended root; no entry script or evaluator changes are needed. The image uses the existing NVIDIA Torch2.12 development runtime, not the paper's Torch2.9.1 stack.

R2E-Gym's committed uv.lock supplies the dependency versions, exported with hashes enforced. The earlier unconstrained installation was deliberately superseded before inference. The locked dependency install succeeds, and script369 imports original PassAgent, PassNetDocker and AgentArgs with both the checkout root and pass_agent directory on the Python search path. The first probe omitted the checkout root and failed with ModuleNotFoundError: No module named 'pass_agent'; this is a probe correction, not an upstream compatibility patch.

Two BuildKit attempts failed to resolve the locally available base image by config ID and registry digest. Script358 uses Docker Engine's local image identity to assemble and commit the image, with equivalent build inputs retained. This is infrastructure setup and does not change the benchmark algorithm.

## Checkpoint identity and interpretation

The generic Qwen3-30B-A3B checkpoint is the explicitly selected local original-agent experiment. The paper's student-training appendix names Qwen3-30B-A3B-Thinking-2507, which is a different model release. Generic model naming in a results table is insufficient evidence that this local checkpoint exactly reproduces that experiment. Preserve this distinction in every reported score; training reproduction remains separate. Native model context is40960, not the paper's262144-token training context.

No new accepted Kiln task, original-agent trajectory or published model-score reproduction follows from these setup checks. API chat/tool calls and actual original container/evaluator execution remain the next required gates.


## Operational provider and original runner gate

Unquantized conversion completes in205.73 seconds. The61095803040-byte GGUF artifact has SHA256 f921b42e9b6191c3ffad54532df61e57fb1477aefdb12f5a4eb496ac8828e8ad, with338 BF16 and241 F32 tensors (579 total,30532122624 elements). The F32 auxiliary tensors are the converter's declared output; no quantized tensor storage is present.

The local-only server binds127.0.0.1:8041, context40960, one slot, all layers on GPU, original embedded template, explicit thinking enabled. The model remains resident; measurements from the cohosted agent are not isolated compiler timing results. Both a real chat response and a correctly structured file_editor function call pass. The server warns that object-valued tool_choice falls back to its default, so the probe proves actual structured tool generation, not strict forced-choice enforcement.

The final evaluator image is sha256:0f8b8235cfda1daed9b1cddfa9162ad320403b90d2d715ed2a8b16cc2861e913 (kiln005-passagent:torch26.05-shell-v5). Its filesystem layers exactly equal the audited source image. Its explicit /usr/bin/env entrypoint forwards the original shell command; no evaluator, pass matcher or integrity logic changes. Derived smoke/full manifests alter only docker_image; full task and graph membership remains unchanged.

Startup failures are retained rather than counted as trajectories. One launch lacked the staged smoke dataset. Another exposed the base image's inherited [bash] entrypoint, causing /bin/bash: /bin/bash: cannot execute binary file and exit126. A Docker commit with an empty ENTRYPOINT retained the temporary container's /bin/true instead; the normal startup assertion caught this. The explicit executable entrypoint passes. A subsequent original run failed locating ./tools/file_editor.py because the launcher selected an output directory as cwd; the original README requires running in pass_agent. The corrected driver supplies that cwd and both import roots, while trajectories use absolute output paths. All these corrections are orchestration/image configuration, not upstream agent modifications.

The v5 operational smoke now reaches the original PassAgent tool-installation and first LiteLLM request. It uses50 steps, temperature0, one worker and the unchanged original runner's131072 max_tokens setting. This is larger than native serving context and remains a recorded compatibility/generalization limit, not an assertion of a131072-token model context. No successful optimization or final score is claimed until trajectory and original evaluator evidence exist.


## Terminal shipping smoke and reward audit

The unchanged original run finishes after50 steps with exit_reason abs_step_limit in1086.22 seconds. Complete trajectory and conversation JSONL, raw logs and serialized best pass are preserved under sources/original-agent-smoke-terminal-v1. There are30 file_editor calls, seven pass_evaluator calls and13 missing-function-call responses. All seven evaluator calls explicitly report no pass matched and return0.10000000000000002. No accepted implementation or measured kernel speedup is established. The serialized best snapshot contains an empty Triton convolution kernel, so it is not a valid implementation even if matching were repaired.

The original runtime's _calculate_reward unconditionally returns1.0 with test_output Reward calculation not yet implemented. This top-level reward must not be aggregated as benchmark performance. Script394 independently extracts the evaluator's Score data JSON and verifies it against the best snapshot's score.txt; no original agent/evaluator code is altered. Its verified-facts.json is the authoritative terminal summary.

A diagnostic using the original source model and saved pattern on small CPU shapes under Torch2.11 finds one ordinary symbolic-FX/Dynamo match, but zero after PassNet's original force_args_symbolic_trace changes functional ReLU from kwargs inplace=True to positional True. This explains why the ordinary DiagnosticMatcher can report no specific failure while _replace_pattern finds no match. The diagnostic uses pinned original tracer source and records both graphs. Script398 then confirms the same discrepancy on the exact Torch2.12 DGX evaluator image: CPU and CUDA, small and original task shapes, all have ordinary match1, original forced match0 and both-normalized match1. This confirms a structural integration defect in the actual runtime; it does not turn the incomplete candidate into a correct kernel. Paper-version behavior still requires separate confirmation before assigning the discrepancy to a specific framework version or interpreting broad model scores. Any evaluator repair would be a separately declared modified protocol.

The owned model server is now stopped after terminal collection; sources/original-agent-smoke-terminal-v1/model-server-release-v1.json records its exact container identity and shutdown. No compiler GPU measurement overlaps subsequent serving. The earlier published reference20 remains a historical first-feedback report, explicitly written while the trajectory was active.

## Token budget and paper-version source inspection

The131072 field is the agent-run token budget; original model_query does not pass max_tokens to LiteLLM. The maximum observed prompt is34415 within the40960 serving context, so this run does not establish context overflow. Archived PyTorch2.9.1 matcher source performs schema-based args/kwargs reconciliation for OpOverload targets, while a Python functional ReLU follows its exact argument-form comparison. This is static source evidence, not a reproduction of the complete paper-version Dynamo/CUDA environment. Reference21 preserves that distinction.
