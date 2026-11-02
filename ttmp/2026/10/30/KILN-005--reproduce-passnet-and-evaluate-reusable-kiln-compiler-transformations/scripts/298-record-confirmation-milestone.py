#!/usr/bin/env python3
"""Append the audited result without rewriting historical experiment checkpoints."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
r=next((p/'reference').glob('18-*.md'))
s=r.read_text().replace('All forty artifacts qualified before their measurement was committed at `5ee83ad`.','All forty artifacts qualified, and that qualification was committed at `5ee83ad` before GPU measurement.')
r.write_text(s)
updates={
'reference/01-detailed-investigation-diary.md':r'''
## Step 134: Independently verify complete fresh-model compiler confirmation

The fixed-source confirmation is complete: all twenty declared families pass strict highest-FP32 source-reference correctness and every timing block is stable. Script 296 independently checks all forty compiled artifacts, frozen source bytes, exact executable identities and 23,400 raw timing samples. The observed family-balanced ratios are 1.0537461946178859 end-to-end and 1.0598777633326413 stream elapsed, with no failures and no retry attempts.

The aggregate conceals a meaningful distribution: nine families are faster, ten slower and one an exact alias. The declared reduction stratum averages 1.115219x end-to-end while the matrix stratum averages 0.995662x. The strongest regression is preserved and consistently directed across repeats. This closes the bounded confirmation task, not the reproduction or autonomous synthesis goal.

### Prompt Context
See Steps 130–133 for the authored implementation and measurement requests. The latest authored clarification asks, "didn't we use to have more before?"
**Assistant interpretation:** Verify the experiment before publication and distinguish experimental population size from cumulative evaluation coverage.
**Inferred user intent:** Continue substantive compiler research while reporting scope and progress accurately.
**Commit (qualification):** 5ee83ad — qualify complete isolated compiler pair before confirmation timing.

### What I did
- Inspected the terminal measurement, summary and completed independent audit. No replacement run or budget change was needed.
- Script 296 reconstructs source exclusions, committed source hashes, all artifacts/fingerprints, each block median/IQR, all repeats and aggregate math.
- Script 297 derives category means from the complete result and writes reference 18 as a technical report.
- Updated the design, guide and roadmap with the verified outcome; retained all raw evidence and intermediate scripts.

### Why
- An aggregate claim must account for every declared member, numerical result and timing budget; a selected success subset would not answer p4wv.
- Exact aliases share measurements rather than manufacturing a noisy before/after comparison.

### What worked
- Twenty unique models/tasks, ten matrix and ten reduction graphs; zero overlap with 290 excluded exact models.
- Forty artifacts, 86 production files per compiler (only tensor.js differs), 161 execution source files, 39 distinct groups and 117 repeat blocks verified.
- All 23,400 samples and aggregate medians/IQRs independently recompute; no retries or failures.
- The largest benefit is 1.451211x on the selected giant-ViT reduction. The largest regression is 0.973413x on Electra discriminator (about 2.73 percent more time), with all three paired ratios below one.

### What didn't work
- The candidate does not improve every workload: ten observed graph ratios are below one; matrix-group aggregate is slightly below one.
- Three repeats do not supply a calibrated confidence interval, and exact-model exclusion does not imply architecture-disjoint testing.
- Native reference precision discrepancies, original PassAgent setup, full-corpus support and current uniform-release evaluation remain unresolved. Updated reMarkable delivery still awaits the earlier explicit approval request; no new export was attempted.

### What I learned
- A transformation motivated by a large contraction-development gain can transfer primarily through a different declared stratum. Aggregate improvement alone does not describe the affected workloads.

### What was tricky to build
- The candidate/control production revisions, shared execution revision, dependency bytes, original source code and metadata-selection amendment are distinct experimental identities. Their separate receipts permit attribution without conflating them.

### What warrants a second pair of eyes
- Inspect the unchanged FP32 numerical rules, preserved incomplete first scan, one exact alias, deterministic order and complete raw samples before interpreting transfer.
- The matrix regression deserves actual schedule/IR inspection before any profitability policy is proposed.

### What should be done in the future
- Publish report 18 to the append-only vault and verify its pushed bytes.
- Treat this now-observed population as development data for later candidates. Obtain fresh confirmation for any subsequent tuning.
- Continue original agent provisioning and full operation/layout/dtype support; do not add these training-list cases to official evaluation coverage.

### Code review instructions
- Start with design 16 and reference 18, then script 296 and reshape-confirmation-independent-audit-v2.json.
- Trace any aggregate to the full measurements JSON; script 297 contains category calculations. Qualification was committed before measurement at 5ee83ad.

### Technical details
- Baseline c15c610; candidate fed37d1; shared execution da42245f2adae05f4bd7baf72743d51867b725dd; NVIDIA GB10, Torch 2.12.0a0+5aff3928d8.nv26.05.
- Highest FP32 reference, TF32 false; separate FP32 elementary rounding; rtol1.3e-6/atol1e-5; 20 warmups,100 trials,3 repeats per group, IQR fraction<=0.2.
- Official cumulative counts stay24/200 tasks,313/2060 graphs (248 within complete tasks); import eligibility1136/64. These are not uniform current-release results.
''',
'design-doc/16-fixed-compiler-confirmation-protocol-with-fresh-exact-model-families.md':r'''
## Complete measured confirmation and independent audit

The v2 measurement is terminal and fully qualifies: twenty families, forty artifacts and no compile, reference, correctness or stability failures. Independent script 296 verifies 161 frozen execution source files, both 86-file production inventories, original input/model sources, every executable fingerprint and all 23,400 raw timing samples. There are 39 distinct groups and 117 repeat blocks, with zero retries and no cross-graph exact artifact aliases.

The observed family-balanced ratios are 1.0537461946178859 end-to-end and 1.0598777633326413 stream elapsed. Nine family ratios are faster, ten slower and one aliases exactly. The declared matrix stratum averages 0.995662114193021 end-to-end and the reduction stratum 1.115218734190397. These descriptive values retain the regressions; they are not calibrated confidence claims or native PassBench scores.

Reference 18 explains attribution and limitations. The entire population is now observed and cannot be reused as unseen confirmation for a later tuned candidate. Task p4wv is complete after this audit. Overall evaluation coverage remains24 tasks/313 graphs; these twenty training-list graphs do not alter the official denominator or numerator.
''',
'design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md':r'''
## 38. Fresh exact-model confirmation of the fixed reshape compiler change

After the candidate was fixed, a separate all-heldout population selected ten matrix and ten reduction graphs from twenty exact models, excluding290 previously exposed/evaluation model identities. The initial memory envelope selected only19 families and remains archived. An explicit broader metadata declaration filled20 before any selected source was compiled or timed. Design16 explains this amendment and isolated production/dependency controls.

Both compiler versions receive identical programs and unchanged fusion settings. All40 artifacts qualify. Original source inputs and a declared highest-precision FP32 reference validate all20 graphs; all117 timing blocks are stable. Script296 independently recomputes every median/IQR from23400 samples and verifies frozen source/artifact identity. The aggregate is1.053746x end-to-end and1.059878x stream elapsed. Reduction-group gains drive the result:1.115219x versus0.995662x for matrix graphs. Nine graph ratios are faster,ten slower,one an exact artifact alias.

Read reference18 before using this as compiler-improvement evidence. It is fresh exact-model confirmation under a bounded FP32 research protocol, not architecture-disjoint evaluation or native benchmark scoring. Later tuning needs new confirmation data. Cumulative official replay remains24/200 complete tasks and313/2060 graphs, while1136/64 are import eligibility. Original PassAgent and full native/support coverage remain open.
''',
'reference/03-project-roadmap.md':r'''
## Fixed-source fresh-model confirmation checkpoint

Task p4wv is complete: all20 declared exact-model confirmation graphs qualify, with all40 artifacts and23400 raw timing samples independently audited. The observed family-balanced ratios are1.053746x end-to-end and1.059878x stream elapsed. Nine families are faster,ten slower andone is an exact alias. Gains concentrate in the reduction stratum (1.115219x); matrix aggregate is0.995662x. Reference18/design16 own the experiment and its scope. No native PassBench score or architecture-disjoint confidence claim is inferred.

These graphs come from the official training list and do not expand the cumulative evaluation coverage of24 tasks/313 graphs or import eligibility1136/64. The bounded confirmation is finished; original PassAgent setup, full operation/dtype/layout coverage, native precision compatibility, uniform current-release evaluation and approved updated device delivery remain active. Any next policy tuned on this population requires a fresh confirmation set.
'''}
for relative,addition in updates.items():
    path=p/relative
    if addition.splitlines()[1] in path.read_text():raise ValueError('Preserve existing entry: '+relative)
    with path.open('a') as f:f.write(addition)
print('Documented complete confirmation')
