#!/usr/bin/env python3
"""Document the model/runtime choice and correct the shipped dataset assumption."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];root=p/'sources/agent-runtime-bootstrap-v1';discovery=json.loads((root/'discovery.json').read_text());membership=json.loads((root/'evaluation-membership.json').read_text())
doc=next((p/'design-doc').glob('18-*.md'));front=doc.read_text().split('---',2)[1]
body='''# Original PassAgent with a pinned local model and complete evaluation membership

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

The derived rows select a dedicated image name, kiln005-passagent:torch26.05. The image still needs construction and execution validation. Fresh task workspaces must begin with empty generated pass directories so existing example/teacher code does not enter an agent trajectory. Original input/model metadata, integrity checks, reverse-order evaluation, scorer and every failure must remain visible.

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
'''
doc.write_text('---'+front+'---\n\n'+body)
entry='''
## Step 140: Pin original-agent dependencies, checkpoint and complete evaluation membership

The next phase targets the original PassAgent rather than another importer increment. Complete public llama.cpp and R2E-Gym source archives are pinned and downloaded, and the original Qwen3-30B-A3B checkpoint is frozen before any model-dependent feedback. The planned unquantized BF16 conversion avoids introducing quantization or a smaller model into the initial agent comparison.

A concrete dataset assumption is corrected: the shipped passbench_demo_dataset_200.jsonl contains200 graph records, one per task, whereas the official evaluation list contains2060 graphs over200 tasks. Directory-name overlap is zero. A derived original-runner dataset preserves the complete official membership in original order, without filtering by Kiln capability.

### Prompt Context
See earlier authored requests to reproduce PassNet, implement/measure the complete system, preserve sources/scripts and maintain detailed diaries. The user supplied manuel@bling and192.168.0.65 in Step136.
**Assistant interpretation:** Provision an explicit public local model endpoint and original framework runtime instead of leaving the agent path indefinitely waiting for a commercial provider.
**Inferred user intent:** Reach actual agent-driven optimization and a credible reference comparison while keeping the full benchmark denominator intact.

### What I did
- Script338 pins llama.cpp0ec4027a and R2E-Gym0d94c4eb and archives their primary server/build/tool-call documentation.
- Script339 downloads complete source tar archives and records SHA256; script340 extracts critical build/runtime/framework files with parent archive provenance.
- Script341 freezes original Qwen checkpointad44e777, all required files and the complete200-task/2060-graph agent manifest.
- Prepared source-verified CUDA server build and bounded/resumable hash-checked checkpoint acquisition drivers; both preserve explicit status receipts and do not overwrite prior jobs.
- Documented design18, original source identities, precision/context limits, membership distinction and the remaining trajectory gates.

### Why
- A smaller or quantized model would add another cause of differences before the original agent framework is exercised.
- The shipping filename containing200 does not prove equivalent benchmark membership. Counts and graph-list bytes must be checked.
- Public local inference avoids dependence on a missing commercial credential while using the authorized DGX.

### What worked
- Both complete source archives and all selected primary documents download successfully and are hashed.
- Original safetensors weights total61066575648 bytes; the complete planned download is61084185821 bytes.
- Exactly200 official task rows and2060 graph records are frozen; shipping demo has200 tasks/200 graphs.
- Existing container provides CUDA13.2.78 and CMake3.31.6; host reports about126.3GB available physical memory and3.4TB free storage at the inspected checkpoint.

### What didn't work
- The HF API could not be opened through the web tool; direct public HTTPS acquisition succeeds and its raw metadata is archived.
- Original PassAgent is not yet executed; successful source acquisition is not a working provider or trajectory.
- Serving arithmetic/context, unquantized conversion, dependency compatibility and actual original-tool execution remain unverified.

### What I learned
- Two different200-task artifacts have different graph cardinalities; using the shipped demo JSONL as the official2060-variant evaluation would silently narrow the experiment.

### What was tricky to build
- The model checkpoint, tokenizer/template, serving source, R2E framework and task membership are distinct inputs. Each needs an independent identity before outcomes can be attributed.

### What warrants a second pair of eyes
- Review BF16 conversion versus parameter identity, tool-call schema behavior, fresh pass workspaces and shared-GPU timing isolation before interpreting an agent score.

### What should be done in the future
- Launch and observe one pinned build and download job, then validate conversion/API/dependencies and original evaluator setup before trajectories.
- Keep every official task and all failures visible; do not count original-agent outcomes as additional Kiln support.

### Code review instructions
- Start with design18, model-download-plan.json, evaluation-membership.json and the pinned archive receipts. Scripts338–344 preserve acquisition and intended execution.

### Technical details
- Full goal stays active. No model inference, agent trajectory, new accepted task or whole-goal completion is claimed at this preparation checkpoint.
'''
diary=p/'reference/01-detailed-investigation-diary.md';assert '## Step 140:' not in diary.read_text()
with diary.open('a') as file:file.write(entry)
print(doc)
