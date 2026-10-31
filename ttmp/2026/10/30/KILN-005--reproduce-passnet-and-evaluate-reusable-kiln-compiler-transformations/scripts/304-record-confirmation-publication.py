#!/usr/bin/env python3
"""Record verified publication and the next-step discovery outcome."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1]
receipt=json.loads((p/'sources/fixed-compiler-confirmation-publication.json').read_text())
assert receipt['vault_revision']==receipt['origin_main']==receipt['advertised_main']
discovery=json.loads((p/'sources/passagent-local-runtime-discovery-v2.json').read_text())
assert discovery['returncode']==255 and 'Could not resolve hostname' in discovery['stderr']
entry=r'''
## Step 135: Publish the complete confirmation report and inspect the next bottleneck

Reference18 is committed in6957c0a and published as a new append-only Obsidian article. Vault commit53d71c9b6baabe9d0b0fe3133df10df99c8ed92d is pushed and verified against the advertised remote branch, committed note bytes and exact ticket-report body. Only the intended article was staged; unrelated vault and repository sources remain untouched.

Post-confirmation structural inspection provides a concrete next investigation: four substantially faster reduction graphs each remove two kernels, while the largest regression retains three kernels and the same recorded schedule/layout metadata with changed CUDA expressions. This is descriptive evidence, not a causal attribution or a new tuned candidate. A read-only DGX model-runtime discovery could not proceed because bling.local failed hostname resolution twice; no model absence or workload state is inferred from that failure.

### Prompt Context
See Steps130–134 for the authored implementation, detailed-diary, source-preservation and vault publication requests.
**Assistant interpretation:** Complete publication and preserve evidence that narrows the next compiler/agent action.
**Inferred user intent:** Keep the long-running reproduction reviewable and advance toward reusable self-optimization.
**Commit (report/evidence):** 6957c0a — verify complete fresh-model compiler confirmation and report mixed gains.

### What I did
- Scripts299/300 append, commit/push and verify the exact report body and remote vault revision.
- Script302 checks artifact hashes before comparing kernel count, scheduling/layout fields and CUDA bodies with entry names normalized.
- Script303 preserves the read-only runtime/cache-name discovery command and both hostname-resolution failures.
- Confirmed taskp4wv is checked while the broad reproduction/integration tasks remain open.

### Why
- Publication requires advertised remote evidence, not only a successful local commit.
- Structural inspection can identify a focused next question without changing a candidate after seeing confirmation timings.
- Provider discovery should inspect existing resources before provisioning another model/runtime.

### What worked
- New article: Projects/2026/10/31/ARTICLE - Kiln - Fixed Compiler Confirmation Across Twenty Fresh Model Families.md.
- Verified body SHA256 f6c6c3bc5b0ae55a688700784dc3dcadfce7819434c47f5faae43dac50eb9e74.
- Giant ViT and Mahmoud8 reduce4->2 kernels, table-transformer5->3, selected Yolos4->2. Nvidia mit-b1 retains3 with changed metadata.
- The full independent audit was rerun locally under Node26.13.0 and exits0; no additional GPU measurement was run.

### What didn't work
- Both discovery attempts report exactly: ssh: Could not resolve hostname bling.local: Name or service not known. Script303 stores exit255. This prevents that read-only inspection; it does not establish that any GPU job stopped or that a model is unavailable.
- Original PassAgent remains unexecuted; previous credential/runtime probes are not a configured provider. No secret values were read and no environment configuration was changed.
- Updated reMarkable delivery remains pending the earlier explicit approval request. No new device export was attempted.

### What I learned
- The positive fresh-model aggregate has a concrete dispatch-count association in several reductions. The largest regression requires generated-code analysis beyond schedule-summary fields.

### What was tricky to build
- One must preserve both the source-pair confirmation identity and the later publication identity. The vault frontmatter records production, execution and report revisions separately.

### What warrants a second pair of eyes
- Review that structural comparisons normalize only CUDA entry names, make no equivalence claim about changed bodies, and do not promote tiny timing differences to significant effects.

### What should be done in the future
- Resolve/recheck DGX access and inspect available local model resources before configuring original PassAgent.
- Analyze emitted/PTX indexing for consistent regressions and finish broader support/native numerical work. A tuned successor needs fresh confirmation; these20 models are observed.

### Code review instructions
- Start with fixed-compiler-confirmation-publication.json, script300 and the committed vault note. Follow script302 into the complete structural inspection JSON.
- The source/runtime discovery JSON explicitly scopes its failure; do not use it as negative evidence for installed models.

### Technical details
- Publication is complete, bounded compiler confirmation is complete, overall goal remains active.
- Cumulative original replay remains24 tasks/313 graphs and import eligibility1136/64. A new uniform current-release full-corpus run remains separate work.
'''
diary=p/'reference/01-detailed-investigation-diary.md'
assert '## Step 135:' not in diary.read_text()
with diary.open('a') as f:f.write(entry)
print('Recorded verified publication and read-only discovery failure')
