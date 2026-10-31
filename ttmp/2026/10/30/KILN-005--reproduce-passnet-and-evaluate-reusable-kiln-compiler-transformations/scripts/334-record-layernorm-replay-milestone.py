#!/usr/bin/env python3
"""Record independently accepted complete replay and update current-state projections."""
import json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';facts=json.loads((s/'gelu-layernorm-cohort-v1-verified-facts.json').read_text());assert facts['graphs_nominal_accepted']==7 and not facts['retained_failures']
roadmap=p/'reference/03-project-roadmap.md';text=roadmap.read_text();cut=text.index('### Fresh conditional-policy checkpoint');current=text[:cut].replace('Twenty-six complete tasks / 331','Twenty-seven complete tasks / 338').replace('twenty-six complete tasks containing 266 graphs, with 331','twenty-seven complete tasks containing 273 graphs, with 338')
roadmap.write_text(current+text[cut:]+'''\n## Complete LayerNorm matching-repair replay\n\nAll seven variants of the frozen targeted task qualify after f1e5518: one replacement, successful execution and nominal t=-5 correctness for every graph. Script325 verifies164 committed source files, all seven artifacts, complete membership and scorer/log identity. The existing coverage builder now reports27/200 complete tasks and338/2060 individual graphs, with273 inside complete tasks. Import eligibility remains1196/69. The initial seven matching failures and35 unexecuted variants from two compile-check failures stay archived. Reference19 and diary138 explain the full milestone; original PassAgent and full native/support scope remain open.\n''')
with (p/'design-doc/17-exact-gelu-source-semantics-and-scalar-operation-math-lowering.md').open('a') as file:file.write('''\n## Complete targeted repair qualification\n\nThe seven-variant task151 replay under f1e5518 is terminal and fully accepted: every graph executes one replacement and passes nominal t=-5 correctness. Independent verification binds all seven artifacts to164 committed compiler/runtime source files and the exact frozen task membership. The cumulative ledger reaches27 tasks/338 graphs (273 within complete tasks). The original zero-replacement run is preserved and both other compile-blocked families remain unqualified. This repairs structural integration and does not change numerical thresholds.\n''')
with (p/'design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md').open('a') as file:file.write('''\n## 39. Exact GELU, source argument kinds and complete qualification\n\nThe source GELU default is erf-based, while Kiln historically selected a tanh approximation. The compiler now exposes both selectors. The importer explicitly chooses the source mode, widens FP16/BF16 operation math to FP32 and narrows at the source result boundary. A shared scalar gelu_erf expression emits CUDA erff. Its independent JavaScript quadrature reference is tested against Python math.erf; no upstream implementation was copied. Exact WGSL remains explicitly unavailable. Design17 records formulas, provenance and backend scope.\n\nAll34 core test files and53 FX tests pass. Twelve fixture programs under three seeds pass36 CUDA records/108 output comparisons. The complete200-task import audit yields1196 graphs/69 complete families. The five newly complete families retain all60 variants in original qualification: two families/18 graphs pass initially, seven variants fail matching and35 remain unexecuted after two compile-check failures. A functional LayerNorm argument-form normalization repairs the complete seven-variant task, which then fully qualifies under f1e5518. Cumulative original replay reaches27/200 tasks and338/2060 graphs, with273 in complete tasks.\n\nThe failed compile compositions remain unresolved: sparse reference discrepancies require predecessor/rounding investigation, and no tolerance was changed. Reference19 explains complete accounting and the distinction between native fixtures, original replay, import eligibility and cumulative evidence across compiler versions. Original PassAgent still needs a configured provider; official local-runtime feasibility references are archived, with no serving/inference result claimed.\n''')
entry='''
## Step 138: Accept the complete LayerNorm repair task and write the GELU milestone

The frozen seven-variant targeted replay under f1e5518 fully qualifies. Every graph has one replacement, successful execution and nominal t=-5 correctness. Independent source/artifact/score verification passes, and the cumulative ledger reaches27 complete tasks/338 individual graphs, with273 graphs inside complete tasks. Import eligibility remains1196/69. This is an additional accepted task rather than a reinterpretation of the failed initial run.

Reference19 develops the exact GELU mathematical/opmath boundary, independent reference, signature normalization and complete original-cohort accounting. It preserves both compile-check failures and their35 unexecuted variants. Publication is the next step after committing this report and evidence.

### Prompt Context
See Steps136–137 for the authored runtime corrections and existing implementation/report/diary requests.
**Assistant interpretation:** Validate the repair on every original variant before updating accepted coverage or publishing the milestone.
**Inferred user intent:** Continue toward the full benchmark while keeping progress counts and remaining gaps reviewable.
**Commit (repair):** f1e5518 — normalize LayerNorm affine arguments after complete GELU qualification.

### What I did
- Verified the committed164-file source snapshot on the DGX and ran the complete seven-variant task through existing export/compile/evaluate/score orchestration.
- Collected only after run.json proves terminal completion. Shared audit checks exact graph order, nominal correctness and one replacement each.
- Reused script325's parameterized source/artifact verification for the targeted run; all seven artifacts and scorer/log hashes agree.
- Added the evaluated replay to the existing ordered coverage ledger, retaining initial failed logs and other unsupported families.
- Wrote reference19 with source provenance, code/pseudocode, architecture diagram and precise coverage/failure interpretation; updated guide and roadmap.

### Why
- CPU matching success is insufficient evidence for actual original replay acceptance.
- The targeted task is a repair population, not held-out compiler optimization evidence. No fresh-generalization claim is added.

### What worked
- Seven of seven variants compile, match once, execute and pass nominal correctness; no targeted replay failures or unexecuted graphs remain.
- Combined GELU qualification adds25 accepted graphs across three complete tasks to the prior24/313 ledger.
- All source identities tie to f1e5518, with unchanged core GELU math and numerical thresholds.

### What didn't work
- Two other complete import families still fail compiler end-to-end checks, retaining35 unexecuted variants. Their sparse discrepancies are unresolved.
- Original PassAgent/provider, uniform current-release full-corpus evaluation and remaining operation/layout/dtype coverage remain open.
- Updated reMarkable delivery still awaits the earlier explicit approval request; no new export was attempted.

### What I learned
- A one-function signature whitelist extension can restore a full family after the numerical compiler path is already implemented; graph/source contracts must remain separate gates.

### What was tricky to build
- Canonical argument normalization changes source-use ordering used for dispatch binding. The full export/generate/compile replay regenerates that ordering and validates it against original inputs, rather than reusing stale artifacts.

### What warrants a second pair of eyes
- Review the initial no-match evidence alongside targeted accepted evidence, and ensure the cumulative ledger supersedes only evaluated logs with identical complete membership.

### What should be done in the future
- Commit and publish reference19 to the append-only vault, checking advertised remote revision and exact report bytes.
- Investigate the35 compile-blocked variants and provision an explicit local/provider endpoint for original PassAgent as separate work.

### Code review instructions
- Start with gelu-layernorm-cohort-v1-verified-facts.json, its source checkpoint, scripts329/330/332/333 and reference19.
- Follow the ledger builder into both original and targeted evaluator logs; a score phase returning0 is never used alone as acceptance.

### Technical details
- Coverage27/200 tasks,338/2060 individual graphs,273 graphs inside complete tasks. Import eligibility1196/69.
- Previous native fixture suite60/63 remains a separate unresolved result; new GELU fixtures36/36 do not relabel it.
- No controlled speedup or whole-goal completion is claimed by this support milestone.
'''
f=p/'reference/01-detailed-investigation-diary.md';assert '## Step 138:' not in f.read_text()
with f.open('a') as file:file.write(entry)
print('Recorded complete accepted repair and current coverage')
