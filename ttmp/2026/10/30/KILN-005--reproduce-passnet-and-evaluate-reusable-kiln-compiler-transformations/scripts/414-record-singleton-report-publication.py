#!/usr/bin/env python3
"""Record verified publication and the next unresolved substantive gates."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];receipt=json.loads((p/'sources/singleton-view-report-publication.json').read_text());body=(p/'sources/singleton-view-report-body.md').read_bytes();assert receipt['body_matches_ticket'] and receipt['remote_main']==receipt['vault_commit'];assert receipt['body_sha256']==hashlib.sha256(body).hexdigest()
entry='''
## Step 147: Publish the singleton and reference-audit technical report

The complete milestone report is published append-only in the Obsidian vault and pushed to main. Its body matches reference21 and the committed source report exactly. The report records31 complete tasks/358 individual graphs, all retained numerical/export failures, and the original-agent reward/tracing findings without claiming full support or a successful reference kernel.

The source/evidence checkpoint is584e341. Compiler production for the new cohort is a040057; these identities are separate in the publication receipt. Both experiment runs are terminal and the owned model server is stopped.

### Prompt Context
See the standing authored request for detailed textbook-style milestone reports in go-go-parc, with commit/push, and the detailed diary requirement. Step146 records the implementation/qualification and completed report review.
**Assistant interpretation:** Finish publication as a verified deliverable while retaining the unresolved full goal.
**Inferred user intent:** Make actual progress and its limitations accessible in the vault and reproducible from source evidence.
**Commit (source/evidence):** 584e34166f37db3b4679e08b41dbf79edf60d9ff — qualify singleton views and audit31 accepted tasks.

### What I did
- Reused the parameterized publisher387, requiring the reviewed report body to be committed before writing the vault note.
- Created one new dated article with metadata, foundational prose, source indexing proof, example code, complete-family table, Mermaid data flow and primary-source references.
- Committed only the new article, pushed main, verified remote HEAD, compared committed note bytes and checked report-body identity.
- Preserved unrelated dropcut-studio modifications and untracked material in the vault.

### Why
- Independent publication identity prevents a later report edit from silently changing the evidence presented as the qualified milestone.
- Separate source/evidence and compiler revisions show which code produced the artifacts and which revision contains the complete reviewed report.

### What worked
- Vault commit '''+receipt['vault_commit']+''' is present on remote main.
- Final body has2762 words; SHA256 '''+receipt['body_sha256']+'''.
- Committed note SHA256 '''+receipt['note_sha256']+'''; body equals reference21 and committed source bytes.
- Previous historical notes are retained; only the intended new note is staged/committed/pushed.

### What didn't work
- No publication failure observed.
- Taskpis5 remains open:33 variants are unexecuted after export failure and two evaluated graphs fail nominal-5. Paper-version runtime matching, broader original-agent evaluation and generated transformation synthesis are incomplete.
- Updated reMarkable delivery remains pending the earlier explicit approval request; no retry or bypass is attempted.

### What I learned
- A current overview plus clearly labeled historical chapters makes the growing intern guide easier to use without deleting earlier evidence.

### What was tricky to build
- Publication metadata distinguishes compiler revision a040057 from report/evidence revision584e341 while preserving a byte-identical report body.

### What warrants a second pair of eyes
- Read the report's complete-family counts alongside the two numerical curves and the33 unexecuted variants. Neither import eligibility nor placeholder reward is accepted as correctness evidence.

### What should be done in the future
- Diagnose the protected S-ViPNAS export check and the two K-Net nominal numerical failures; keep the full frozen populations and thresholds.
- Finish shared native-validation startup consolidation, investigate paper-version matching and advance the native compiler-agent interface using existing policy/verification machinery.
- Continue full200-task support, controlled current-release measurements and pending requested delivery. No completion claim is made.

### Code review instructions
- Start with reference21, singleton-view-report-publication.json and source/evidence commit584e341.
- Trace its facts to singleton-view-source-cohort-v1-verified-facts.json and original-agent-smoke-terminal-v1/verified-facts.json.

### Technical details
- New note: Projects/2026/10/31/ARTICLE - Kiln - Singleton View Contracts and Audited Agent Failure.md.
- Worktree research/passnet; endpoint manuel@bling with HostKeyAlias=bling.local, supplied IP192.168.0.65. Both named qualification sessions and the original agent session are terminal.
'''
with (p/'reference/01-detailed-investigation-diary.md').open('a') as file:file.write(entry)
