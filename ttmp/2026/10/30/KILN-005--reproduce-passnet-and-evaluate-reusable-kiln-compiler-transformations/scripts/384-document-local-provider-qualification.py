#!/usr/bin/env python3
"""Document conversion/API qualification and exact original-agent launch failures."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
doc=next((p/'design-doc').glob('18-*.md'))
s=doc.read_text().replace('The image still needs construction and execution validation.', 'Source fidelity and normal shell startup are now verified; see the setup checkpoints below.')
s+='''

## Operational provider and original runner gate

Unquantized conversion completes in205.73 seconds. The61095803040-byte GGUF artifact has SHA256 f921b42e9b6191c3ffad54532df61e57fb1477aefdb12f5a4eb496ac8828e8ad, with338 BF16 and241 F32 tensors (579 total,30532122624 elements). The F32 auxiliary tensors are the converter's declared output; no quantized tensor storage is present.

The local-only server binds127.0.0.1:8041, context40960, one slot, all layers on GPU, original embedded template, explicit thinking enabled. The model remains resident; measurements from the cohosted agent are not isolated compiler timing results. Both a real chat response and a correctly structured file_editor function call pass. The server warns that object-valued tool_choice falls back to its default, so the probe proves actual structured tool generation, not strict forced-choice enforcement.

The final evaluator image is sha256:0f8b8235cfda1daed9b1cddfa9162ad320403b90d2d715ed2a8b16cc2861e913 (kiln005-passagent:torch26.05-shell-v5). Its filesystem layers exactly equal the audited source image. Its explicit /usr/bin/env entrypoint forwards the original shell command; no evaluator, pass matcher or integrity logic changes. Derived smoke/full manifests alter only docker_image; full task and graph membership remains unchanged.

Startup failures are retained rather than counted as trajectories. One launch lacked the staged smoke dataset. Another exposed the base image's inherited [bash] entrypoint, causing /bin/bash: /bin/bash: cannot execute binary file and exit126. A Docker commit with an empty ENTRYPOINT retained the temporary container's /bin/true instead; the normal startup assertion caught this. The explicit executable entrypoint passes. A subsequent original run failed locating ./tools/file_editor.py because the launcher selected an output directory as cwd; the original README requires running in pass_agent. The corrected driver supplies that cwd and both import roots, while trajectories use absolute output paths. All these corrections are orchestration/image configuration, not upstream agent modifications.

The v5 operational smoke now reaches the original PassAgent tool-installation and first LiteLLM request. It uses50 steps, temperature0, one worker and the unchanged original runner's131072 max_tokens setting. This is larger than native serving context and remains a recorded compatibility/generalization limit, not an assertion of a131072-token model context. No successful optimization or final score is claimed until trajectory and original evaluator evidence exist.
'''
doc.write_text(s)
entry='''
## Step 142: Serve the unquantized model and enter the original agent loop

The local provider is operational: conversion/type/hash checks complete, the server loads the model, and real chat plus structured tool calls pass. The original PassAgent now installs its tools, reads the shipped task and sends its first model request. This is an operational-loop milestone; no optimized pass or additional accepted Kiln graph is claimed.

Several startup mistakes were in the orchestration I wrote. They are preserved with exact diagnostics and separately identified attempts. The final image changes execution configuration only; its source filesystem layers exactly match the audited image, and the original agent/evaluator source remains unchanged.

### Prompt Context
See Step141 and the user's request to use manuel@bling, retain intermediate scripts, document failures and reassess architectural sprawl.
**Assistant interpretation:** Complete the provider and actual original-framework execution gates before attributing any optimization result.
**Inferred user intent:** Reach a working reference agent and then use evidence to compare reusable compiler improvement.
**Commit (code):** 06c183e — qualified image sources, dependency lock and initial setup diary.

### What I did
- Script367 completes original unquantized conversion and records output hash/type counts.
- Scripts372–374 serve/probe the local model. Both chat and actual file_editor tool-call JSON pass.
- Scripts375–383 retain separately identified runner attempts, source-layer-preserving image configuration corrections, bounded observation and source collection.
- Added preconditions for dataset staging, qualified image status and tool files; launch from original pass_agent cwd with both required import roots.
- The corrected v5 run reaches original tool setup and its first LiteLLM model request, with50 steps, temperature0 and one worker.

### Why
- An import-only check cannot establish container startup, tool installation or actual provider behavior.
- Docker command configuration can fail while a source checksum check passes. Both gates are necessary and measure distinct properties.
- Preserving original relative tool paths and documented cwd avoids unnecessary changes to the framework.

### What worked
- GGUF:61095803040 bytes; SHA256 f921b42e9b6191c3ffad54532df61e57fb1477aefdb12f5a4eb496ac8828e8ad;338 BF16 and241 F32 tensors, no quantized storage.
- Server healthy on127.0.0.1:8041; two real API probes complete with correct chat/tool semantics.
- Image0f8b8235 passes normal shell startup and has exactly the same filesystem layers as audited imagee5c039c2.
- Full manifest retains200 tasks; only docker_image changes. The operational smoke remains one shipped task/one graph.

### What didn't work
- Original launchv1 stopped before the runner: FileNotFoundError for passagent-shipping-smoke.jsonl. I omitted remote staging; script380 records the failure and stages the frozen bytes.
- Launchv2 container exits126: /bin/bash: /bin/bash: cannot execute binary file. The original runtime reports exit137 for a racing exec and then misleadingly reports the task directory missing. Container logs/config identify inherited ENTRYPOINT [bash] as the cause.
- Image correctionv4 with ENTRYPOINT [] retains temporary /bin/true under Docker commit. The startup assertion fails. I also launched a dependent attempt before checking that result; it stopped on its missing derived dataset and performed no agent work. Imagev5 uses explicit /usr/bin/env and passes normal startup.
- Original runv4 reaches runtime setup but fails: FileNotFoundError: [Errno 2] No such file or directory: './tools/file_editor.py'. The launcher cwd was wrong. Runv5 uses documented pass_agent cwd; no upstream code changes.
- Initial health probe returns HTTP503 during normal model loading. The existing server is observed until healthy; it is not restarted.
- Server warns object-valued tool_choice is treated as its default. Actual tool JSON passes, but strict forced tool-choice handling is not claimed.

### What I learned
- The original runner can print All tasks completed and exit0 despite producing zero trajectories. The driver separately requires a nonempty trajectory artifact and preserves failures.
- The original tool config relies on paths relative to pass_agent, independent of the absolute config argument.
- Configuration-only image corrections can be checked by filesystem-layer equality, retaining the prior detailed source fidelity evidence.

### What was tricky to build
- Three boundaries required distinct checks: Python imports, container shell execution and original command installation. Passing one says little about the next.
- The final driver consolidates these preconditions rather than introducing an alternative agent interface or evaluator adapter. Historical intermediate scripts remain for provenance.

### What warrants a second pair of eyes
- Review the server's actual tool response versus its tool_choice warning, the declared context limit and original runner's max_tokens setting.
- Do not interpret cohosted model-resident timings as isolated kernel or paper-hardware performance.

### What should be done in the future
- Observe actual file edits and original evaluator feedback, preserve the terminal trajectory and generated pass, and remeasure any best pass with inference unloaded before performance claims.
- Expand from the operational smoke to declared complete task populations; original-agent results do not increase Kiln compiler support.

### Code review instructions
- Start with design18, provider-evidence-image-entrypoint-diagnosis and model-api-probe-v1.json. Inspect scripts375,377,381–382 for execution configuration and failure preconditions.
- Confirm every official task remains in the full derived manifest and review the raw failed-run logs alongside successful startup evidence.

### Technical details
- Server tmux: passnet-original-model-server-v1. Active original-agent tmux: passnet-original-agent-smoke-v5. Do not restart either because an observation times out.
- Accepted Kiln coverage remains27 complete tasks and338 graph variants across prior recorded runs; original task scoring is still pending at this checkpoint.
'''
with (p/'reference/01-detailed-investigation-diary.md').open('a') as f:f.write(entry)
