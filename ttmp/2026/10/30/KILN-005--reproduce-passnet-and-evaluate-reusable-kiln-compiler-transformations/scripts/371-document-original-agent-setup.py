#!/usr/bin/env python3
"""Append the setup investigation and update its focused architecture document."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
doc=next((p/'design-doc').glob('18-*.md'))
with doc.open('a') as f:f.write('''

## Verified setup checkpoint

The CUDA llama-server build is complete (binary SHA256120e0aa1ff814a42027669f3bc9cb3df03e1d797796c91c129f144a1db95fd57). All25 checkpoint files,61084185821 bytes, have passed the pinned content checks. The independent converter environment passes its upstream CLI import/help gate. Script367 runs the original converter with --outtype bf16, and rejects a final artifact containing storage types other than BF16/F32. Conversion is a separate gate from inference agreement.

The dedicated original-agent image is sha256:e5c039c27c487f6c15b9f2d90bfb4c326d986b2731a2be83eece2e039e231ab6. Fidelity validation checks14876 source files,603 symlinks,201 empty pass directories and all200 tasks/2060 graph metadata paths. Original entry.sh links resolve to the intended root; no entry script or evaluator changes are needed. The image uses the existing NVIDIA Torch2.12 development runtime, not the paper's Torch2.9.1 stack.

R2E-Gym's committed uv.lock supplies the dependency versions, exported with hashes enforced. The earlier unconstrained installation was deliberately superseded before inference. The locked dependency install succeeds, and script369 imports original PassAgent, PassNetDocker and AgentArgs with both the checkout root and pass_agent directory on the Python search path. The first probe omitted the checkout root and failed with ModuleNotFoundError: No module named 'pass_agent'; this is a probe correction, not an upstream compatibility patch.

Two BuildKit attempts failed to resolve the locally available base image by config ID and registry digest. Script358 uses Docker Engine's local image identity to assemble and commit the image, with equivalent build inputs retained. This is infrastructure setup and does not change the benchmark algorithm.

## Checkpoint identity and interpretation

The generic Qwen3-30B-A3B checkpoint is the explicitly selected local original-agent experiment. The paper's student-training appendix names Qwen3-30B-A3B-Thinking-2507, which is a different model release. Generic model naming in a results table is insufficient evidence that this local checkpoint exactly reproduces that experiment. Preserve this distinction in every reported score; training reproduction remains separate. Native model context is40960, not the paper's262144-token training context.

No new accepted Kiln task, original-agent trajectory or published model-score reproduction follows from these setup checks. API chat/tool calls and actual original container/evaluator execution remain the next required gates.
''')
entry='''
## Step 141: Qualify the original agent image, checkpoint and locked framework imports

The original-agent infrastructure now has verified source, data and dependency identities. The CUDA server build and complete checkpoint download finish successfully. The agent image preserves original evaluator files and symlinks across all200 tasks and2060 graphs; the locked framework imports without source modifications after correcting the probe search path. BF16 conversion has started in its own tmux session.

This checkpoint does not increase accepted Kiln coverage (27 complete tasks,338 graph variants across recorded runs). It establishes the prerequisites for observing the original agent's tool loop with a declared local model.

### Prompt Context
See Step140 and the earlier requests to preserve scripts, sources and detailed implementation history. The latest authored user instruction is: "you can also just manuel@bling".
**Assistant interpretation:** Continue authorized DGX execution using the provided SSH endpoint and preserve a reviewable setup boundary.
**Inferred user intent:** Reach working agent optimization without losing experimental provenance.
**Commit (code):** 8138481 — pinned original-agent runtime and full membership; this step records subsequent execution.

### What I did
- Scripts346–366 preserve bounded observations, image assembly, original entry preflight, original dependency lock export/install, failures and diagnosed recoveries.
- Verified14876 original source files,603 symlinks,201 empty generated-pass directories and all canonical200/2060 graph paths in the assembled image.
- Downloaded and verified25 original model/tokenizer/config/license files,61084185821 bytes, under remote sources; copied their receipt rather than committing bulk weights.
- Used R2E-Gym's original uv.lock with artifact hashes enforced. Stopped only the owned unconstrained installer after this dependency-fidelity decision; preserved its logs and explicit supersession receipt.
- Script369 supplies both original import roots, successfully importing PassAgent, PassNetDocker and AgentArgs without upstream edits.
- Scripts367–368 start unquantized BF16 conversion; scripts370–371 retain evidence and this documentation.

### Why
- Pinning framework source while allowing all transitive dependencies to drift would weaken reproducibility.
- Image source fidelity and actual symlink resolution resolve concrete integration concerns before asking a model to edit a pass.
- Local Docker image identity is available even when registry resolution fails; preserving that identity avoids selecting another runtime silently.

### What worked
- CUDA server build completes in about202.56 seconds; pinned binary SHA256 is120e0aa1ff814a42027669f3bc9cb3df03e1d797796c91c129f144a1db95fd57.
- Complete model acquisition, image fidelity check, converter dependency/help gate and corrected original-framework import gate pass.
- Original entry scripts require no repair: their symlink targets establish the intended root.

### What didn't work
- Initial agent/converter pip installs failed with ReadTimeoutError from files.pythonhosted.org. Separate diagnosed retries use120-second timeout and5 retries; no live job is restarted because an observation timed out.
- BuildKit treated a local config ID as a remote image name, then could not resolve the recorded registry digest. Logs/receipts preserve both failures; local Docker Engine image assembly succeeds.
- Initial locked import probe failed: ModuleNotFoundError: No module named 'pass_agent'. Script369 corrects the probe search paths; pinned source and dependencies remain unchanged.
- Converter/API/trajectory outcomes are not yet qualified at this diary checkpoint.

### What I learned
- Original absolute imports use both package-root and pass_agent-root paths. The operational launcher must supply both.
- The paper's student-training checkpoint is explicitly Thinking-2507; this generic Qwen3 checkpoint cannot be presented as an exact published-score reproduction.
- The original LiteLLM import fetches public model price/context metadata at runtime; this behavior appears in the retained import receipt and needs consideration when recording provider configuration.

### What was tricky to build
- Docker image configuration IDs and retrievable registry manifests are different identities. Source/data verification after local assembly proves what is actually available to the agent.
- Separating host controller, CPU conversion environment and GPU evaluator avoids forcing incompatible dependency sets into one environment.

### What warrants a second pair of eyes
- Verify that the complete official membership remains distinct from the shipping smoke dataset, and that no model/API setup result is counted as compiler correctness.
- Review model template/thinking/context settings and cohosted inference memory residency before interpreting benchmark timings.

### What should be done in the future
- Complete conversion/type/hash checks, validate real chat/function-call responses, then execute an original-framework smoke trajectory and retain its complete tool feedback.
- Continue full official evaluation accounting and remaining Kiln precision/operation support; the whole goal remains active.

### Code review instructions
- Begin with design18 and sources/agent-runtime-bootstrap-v1/agent-image-fidelity-v1.json, model-download-v1.json and agent-locked-import-v2.json.
- Review scripts358,361–362,367–370 and terminal failure logs before interpreting setup completion.

### Technical details
- Remote endpoint manuel@bling, HostKeyAlias=bling.local; all workloads retain named tmux sessions and explicit receipts.
- Agent image sha256:e5c039c27c487f6c15b9f2d90bfb4c326d986b2731a2be83eece2e039e231ab6; no original-agent inference was run before dependency locking.
'''
with (p/'reference/01-detailed-investigation-diary.md').open('a') as f:f.write(entry)
