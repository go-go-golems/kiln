#!/usr/bin/env python3
"""Record the independently verified append-only vault publication."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];receipt=json.loads((p/'sources/gelu-report-publication.json').read_text())
assert receipt['vault_revision']==receipt['origin_main']==receipt['advertised_main']
entry='''
## Step 139: Publish the exact-GELU technical milestone

Reference19 and the complete targeted replay evidence are committed in7795d81. The new Obsidian article is committed and pushed in3f2f06172cea788652d1da6e9c75b7e003b58d22. Script336 verifies the exact ticket/article body, committed vault bytes and advertised remote branch. Unrelated vault edits and the repository's untracked root sources remain untouched.

The milestone closes the exact activation and diagnosed LayerNorm matching repair, while retaining the two numerical compile-check failures and35 unexecuted variants. Current accepted replay is27 tasks/338 graphs, with import eligibility1196/69. Full reproduction, original PassAgent, native precision compatibility and uniform current-release evaluation remain active requirements.

### Prompt Context
See Steps136–138 and earlier authored requests to maintain the detailed diary, preserve scripts/sources and commit/push technical milestone reports to the vault.
**Assistant interpretation:** Finish the report's durable publication and independently verify external state.
**Inferred user intent:** Keep reviewable technical explanations alongside the compiler evidence.
**Commit (report/evidence):** 7795d81 — verify complete GELU matching repair and report27-task coverage.

### What I did
- Script335 creates a new dated ARTICLE note with implementation, matching-repair and report revisions in frontmatter.
- Committed only that article, pushed main and ran script336 against actual git ls-remote output.
- Retained publication receipt and exact body hash; no device export or model inference was attempted.

### Why
- Successful local writing alone does not prove requested publication. Exact body and advertised revision checks establish what was delivered.

### What worked
- Vault article: Projects/2026/10/31/ARTICLE - Kiln - Exact GELU and Complete Source Qualification.md.
- Body SHA256:6263c17de09b8e42a0e58de7af61f86ca1a0b567a294a83abcf0c0b6be137b50.
- Vault local HEAD, origin/main and advertised main all equal3f2f06172cea788652d1da6e9c75b7e003b58d22.

### What didn't work
- No new publication failure occurred. The two numerical compile-check failures remain unresolved, and original PassAgent has no configured provider yet.
- Updated reMarkable delivery still awaits the earlier explicit approval request; no new export was attempted.

### What I learned
- The report can make three different progress measures explicit: import eligibility, independently accepted original replay and bounded native fixtures.

### What was tricky to build
- The source implementation, signature repair, evaluator snapshots and final report have different revisions. The article records them separately rather than using publication time as code identity.

### What warrants a second pair of eyes
- Review that the reported25 added accepted graphs include the separately repaired complete seven-variant family, while35 compile-blocked variants remain visible.

### What should be done in the future
- Provision an explicit original PassAgent model/runtime and investigate sparse predecessor/reference discrepancies without weakening the numerical contract.
- Continue remaining operation/layout/dtype support and perform a uniform full-corpus current-release evaluation. The full goal is not complete.

### Code review instructions
- Read gelu-report-publication.json and script336, then compare the committed vault article with reference19.

### Technical details
- Worktree research/passnet; runtime endpoint manuel@bling with HostKeyAlias=bling.local; supplied IP192.168.0.65 remains available.
- Both GELU GPU jobs are terminal according to collected complete run receipts; no restarted or duplicate workload is claimed.
'''
file=p/'reference/01-detailed-investigation-diary.md';assert '## Step 139:' not in file.read_text()
with file.open('a') as output:output.write(entry)
print('Recorded verified GELU report publication')
