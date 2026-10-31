#!/usr/bin/env python3
"""Record actual evaluator feedback, published report identity and safe resume state."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];receipt=json.loads((p/'sources/original-agent-report-publication.json').read_text());assert receipt['body_matches_ticket'] and receipt['remote_main']==receipt['vault_commit']
entry='''
## Step 143: Preserve genuine evaluator rejection and publish the original-agent technical report

The original agent now completes real editing/evaluation steps and receives PassBench feedback. The first observed evaluation rejects the candidate because no pass modifies the graph, producing the configured0.1 failure contribution. The agent continues from that rejection; the latest bounded observation records27 of50 steps remaining. This is an actual feedback loop, not an accepted optimization.

The2357-word textbook-style follow-up explains the architecture, frozen task membership, model conversion, dependency/runtime identities, startup failures and scientific limits. The complete report is stored as reference20 and copied append-only into the vault. Publication is pushed and independently verified against remote main and committed bytes.

### Prompt Context
See the earlier request for a detailed project report in the go-go-parc vault, with textbook prose, no analogies, commit/push, and the standing request to retain intermediate scripts and a detailed diary. Endpoint instruction is recorded verbatim in Step141.
**Assistant interpretation:** Preserve the first real reference-agent feedback and publish its meaning without counting setup as compiler coverage.
**Inferred user intent:** Make progress independently reviewable and distinguish operational success from research results.
**Commit (code):** fe1a0b9 — local provider and original agent-loop entry;06c183e — source/dependency setup.

### What I did
- Observed original model/editor/evaluator progression and retained the actual no-match rejection and penalty score.
- Completed the earlier source collector before the current milestone; retained its final manifest and raw v5 log/receipt as a subsequent evidence snapshot.
- Consolidated script379 from repeated SSH connections into a single bounded collection, preserving all prior snapshots and recording capture/source hashes.
- Authored reference20 through script385, reviewed prose/links/metadata and aligned its body with the publication source. Script386 preserves typography corrections.
- Script387 writes one new vault note, stages only that note, commits, pushes, verifies remote main and checks committed byte/body identity.
- Updated the guide/roadmap with a concise pointer to current provider facts; historical compiler and benchmark evidence remain intact.

### Why
- Original evaluator rejection proves the tool loop can carry genuine experimental feedback, but says nothing positive about candidate correctness or speed.
- A source-complete image, a healthy API and a successful benchmark candidate establish different facts. The report teaches these distinctions and keeps all task denominators explicit.
- Collecting evidence with one SSH invocation reduces orchestration overhead; historical diagnostic scripts remain available as requested rather than being removed.

### What worked
- Original PassBench reports Has Any pass matched? [False], early-exits on mismatch and returns aggregated_speedup=0.10000000000000002. The agent receives the failure and continues.
- Reference20 and the vault article have identical body bytes. Code fences are balanced, internal report links resolve to existing note names, and the report contains2357 words.
- Vault commit '''+receipt['vault_commit']+''' is verified on remote main. Body SHA256 '''+receipt['body_sha256']+'''.
- Publication preserves unrelated vault changes; only the new intended note is staged/committed.

### What didn't work
- No candidate acceptance or terminal trajectory is established at this checkpoint. The no-match score is a failed candidate result, not a speedup measurement.
- One report typography command initially used paths relative to the repository root instead of the ticket root and raised FileNotFoundError before modifying files. Script386 uses its own resolved ticket directory and succeeds.
- The earlier source commit overlapped a still-finishing collector. Its final manifest/raw v5 files are included in this checkpoint after the collector is verified terminal; the new batched collector avoids the long multi-connection tail.

### What I learned
- An original-framework operational milestone is useful even when the candidate fails, provided the failure remains visible and is not reclassified as benchmark acceptance.
- The original runner's exit0/All tasks completed output remains insufficient; terminal artifact inspection must establish trajectory presence and actual outcome.

### What was tricky to build
- Report scope is frozen at first genuine feedback while the remote agent continues. The report explicitly states this time boundary instead of implying terminal success.
- Candidate logs may grow remotely; each retained snapshot freezes its own bytes and hashes without claiming to be the final trajectory.

### What warrants a second pair of eyes
- Review complete original logs, matcher failure and candidate artifacts before accepting any later score. Preserve the current model/runtime context limitations.
- Check report population counts against evaluation-membership.json and current accepted ledger; original-agent activity does not increase Kiln support.

### What should be done in the future
- Resume the existing passnet-original-agent-smoke-v5 session, collect terminal trajectory/completions/generated pass and interpret all outcomes. Do not restart because an observation times out.
- Measure any successful best candidate with inference unloaded under an explicit follow-up protocol, then expand the original-agent population and continue Kiln-native synthesis/full support work.
- Updated reMarkable delivery remains pending the earlier explicit approval request; no new export is attempted.

### Code review instructions
- Start with reference20 and sources/original-agent-report-publication.json, then provider-evidence-genuine-evaluator-feedback and its manifest.
- Review scripts375,379,385–388 for execution gates, snapshot semantics, article body and publication staging/identity checks.

### Technical details
- New note: Projects/2026/10/31/ARTICLE - Kiln - Original PassAgent Execution and Experimental Identity.md.
- Original server and agent remain in their existing named tmux sessions; no second inference job or isolated compiler benchmark was started.
- Accepted Kiln replay remains27 complete tasks/338 individual graphs (273 in complete tasks), distinct from1196/69 import eligibility and the200/2060 official evaluation population.
'''
with (p/'reference/01-detailed-investigation-diary.md').open('a') as f:f.write(entry)
with (p/'reference/03-project-roadmap.md').open('a') as f:f.write('''

### Original-agent operational milestone

The pinned unquantized local provider now serves real tool calls, and the unchanged original PassAgent has invoked the original evaluator and received a genuine no-match rejection. Its50-step shipping smoke remains active at this checkpoint; terminal candidate results and the full official population are separate gates. Design18/reference20 and diary Steps140–143 own model/runtime identities, full200/2060 membership, failures and publication evidence. Kiln coverage is unchanged. The final image corrects shell execution configuration while retaining exactly the audited source layers.
''')
with (p/'design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md').open('a') as f:f.write('''

## 40. Running original PassAgent with the pinned local provider

The model endpoint is now operational, and the original framework has completed actual editor/evaluator steps. Design18 owns its checkpoint, serving and image identities. Reference20 explains the complete data flow and first genuine rejection. The endpoint milestone does not increase Kiln coverage or establish a successful kernel optimization.

For continuation, inspect the existing passnet-original-agent-smoke-v5 tmux session and original-agent-smoke-v5.json before launching anything. Script378 preserves bounded observations; script379 freezes receipts/log bytes in a new tagged sources directory through one SSH request. Script375 invokes original source with explicit local provider settings, both required Python import roots and documented pass_agent working directory. Do not change this active experiment's source or membership. Terminal trajectory collection and isolated best-pass measurements are the next gates.
''')
