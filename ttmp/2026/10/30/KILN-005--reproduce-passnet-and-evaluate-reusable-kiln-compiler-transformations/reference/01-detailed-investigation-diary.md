---
Title: Detailed investigation diary
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-30T20:23:37.182783259-04:00
WhatFor: ""
WhenToUse: ""
---

# Detailed investigation diary

## Step 1: Establish an isolated reproduction workspace and primary sources

Created branch `research/passnet` and its worktree, then created KILN-005 using docmgr. Downloaded the arXiv paper and Hugging Face file inventory into the ticket sources directory. The prior goal turn made progress by creating these authoritative artifacts; no reproduction measurement has occurred yet.

### Prompt Context
**User prompt (verbatim):** "store the information in the ticket too as a source/ document, and download all the erelevant material you need and find (if you need to search) into the sources/ folder too."
**Assistant interpretation:** Archive the supplied research and primary references alongside the implementation guide.
**Inferred user intent:** Make the experiment independently reviewable and reproducible. The larger original request is available in the conversation; full source transcription remains pending.

### What I did
- Created the requested worktree after an approved sandbox escalation for Git metadata.
- Created the ticket, guide skeleton, and this diary with docmgr.
- Downloaded paper.pdf, extracted paper.txt with pdftotext, and saved dataset-files.json.
- Inspected scripts/kiln-export.mjs and runtime/python/kiln_launch.py.

### Why
- Preserve the unmodified reference experiment separately from Kiln integration.
- Verify preliminary API and protocol claims before implementing them.

### What worked
- Paper Table 3 confirms A30 24 GB, CUDA 12.8, PyTorch 2.9.1+cu128, Triton 3.5.1, 20 warmups, 100 trials, and rerun at IQR greater than 20% of median.
- Kiln exposes open_program and CudaProgram.launch with caller pointers and stream; the export CLI supports an a100 target.

### What didn't work
- Default sandbox download: `curl: (6) Could not resolve host: arxiv.org`; escalation enabled the paper and inventory downloads.
- First worktree attempt: `fatal: cannot lock ref 'refs/heads/research/passnet': unable to create directory for .git/refs/heads/research/passnet`; approved escalation resolved it.
- Reference clone used the configured SSH rewrite and stalled. A second clone explicitly prefers HTTPS and is being observed before further recovery.
- `nvidia-smi`: `command not found`. Local CUDA execution capability is unproven.

### What I learned
- Local Node is v24.18.0, while package.json requires Node >=26. Resolve this before claiming supported-environment validation.
- Dataset inventory contains 14 Parquet shards; the first is 661,340,081 bytes. Inventory download is not dataset download.

### What was tricky to build
- Network and Git metadata require sandbox escalation. Source downloads must live under the ticket rather than a repository-level scratch directory.

### What warrants a second pair of eyes
- Scoring implementation, integrity constraints, supported dtype/layout semantics, and exact task split need direct source inspection.

### What should be done in the future
- Preserve the complete user research as a source document, finish upstream archive and dataset acquisition, pin revisions and hashes, and write the intern guide.
- Establish CPU validation and GPU execution resources before baseline and bridge measurements.

### Code review instructions
- Inspect sources/paper.txt Table 3 and the dataset inventory; compare scripts/kiln-export.mjs and runtime/python/kiln_launch.py with the guide once written.

### Technical details
- Worktree: /home/manuel/code/wesen/kiln/worktrees/passnet.
- Reference paper: https://arxiv.org/pdf/2605.29357, v1 dated 28 May 2026.
- Runtime launch signature: launch(stream=0, scratch=None, **pointers).

## Step 2: Pin sources and establish DGX Spark execution access

Resolved immutable reference revisions and started the complete dataset download in tmux with SHA256 verification against Hugging Face LFS metadata. Archived the user research as an explicitly condensed source document rather than presenting it as a verbatim transcript.

### Prompt Context
**User prompt (verbatim):** "you can use bling.local: which is a DGX spark to run your workfloads"
**Assistant interpretation:** Use the existing DGX Spark for GPU execution.
**Inferred user intent:** Remove local hardware limitations without reducing implementation scope.

### What I did
- Inspected bling.local through SSH: GB10, ARM64, driver 580.178.04 reporting CUDA capability 13.0, Docker 29.6.2, Python 3.12.3, Node 26.8.1, 3.4 TB available.
- Pinned PassNet develop to 61c64709f6d324216ae8252cec3cdc35b2dd5da5 and dataset to 4f7dd9211178327c2718f1b828d83ea126186f9e.
- Added scripts/01-download-dataset.py; launched tmux session passnet-dataset with persistent log.

### Why
- Immutable downloads and checksum verification establish source provenance.
- Keep large material locally under sources while committing inventories, scripts and receipts.

### What worked
- SSH host inspection succeeded. Dataset first shard reached 239 MB during observation; no completed dataset claim yet.

### What didn't work
- Git clone remains slow or stalled; independent pinned codeload archive is downloading. Neither an observation timeout nor a directory proves completion.

### What I learned
- DGX Spark differs from the paper A30 in GPU architecture, host architecture and software. Report this as a hardware-port reproduction.
- NVIDIA-SMI CUDA version is driver capability, not proof of installed toolkit or PyTorch CUDA support.

### What was tricky to build
- Pinned source archive avoids depending on configured SSH URL rewrites without changing global Git configuration.

### What warrants a second pair of eyes
- ARM64/Blackwell compatibility with pinned PyTorch/Triton and benchmark defenses.

### What should be done in the future
- Inspect remote containers and CUDA-enabled Python, complete downloads, materialize dataset safely, and write the guide against executable source contracts.
- User explicitly authorizes implementing missing Kiln capabilities with design documentation and diary entries; do not redefine success as a restricted subset.

### Code review instructions
- Review the downloader's size/hash checks and revision metadata before trusting the corpus.

### Technical details
- Dataset receipt is written only after each shard verifies; interrupted partial files are not valid shards.

## Step 3: Verify CUDA execution and document implementation contracts

Wrote the first substantive intern guide against the paper, pinned PassBench README and current Kiln runtime/compiler sources. Verified real CUDA tensor execution in an existing DGX Spark container; this proves execution availability but not PassBench compatibility.

### Prompt Context
**User prompt (verbatim):** "Don't hesitate to look at pytorch or passnet or research or so if there is something that needs to be ported to kiln, make sure to properly document it though in the diary so we can keep track of where what is coming from"
**Assistant interpretation:** Consult upstream implementations and research as necessary, preserving exact provenance for every port.
**Inferred user intent:** Build missing capabilities with an auditable implementation history.

### What I did
- Archived pinned PassBench and PassAgent READMEs in sources/upstream-readmes.
- Added guide sections covering graph/task structure, pass module API, corpus materialization, numerical checking, runtime ownership, importer semantics, policy experiments and delivery gates.
- Ran a CUDA tensor calculation in localhost:5000/playback-redaction:base-26.05 on bling.local.

### Why
- Executable environment verification resolves the hardware uncertainty before implementation.
- Design boundaries prevent silent dtype/layout errors and invalid benchmark comparisons.

### What worked
- Container reported PyTorch 2.12.0a0+5aff3928d8.nv26.05, Triton 3.7.0, CUDA 13.2, NVIDIA GB10, capability (12,1).
- CUDA arange squared and copied to CPU produced [0,1,4,9,16,25,36,49].
- Verified mergeLoopOps guard in packages/kiln/src/std/loop.js is now <= was * 1.02.

### What didn't work
- No new failures; full source and dataset acquisition remain in progress, not complete.

### What I learned
- Existing usable GPU environment differs materially from paper versions. Record both hardware and software deviations.
- The pinned README confirms 25 warmups and squared-slowdown prose, requiring reconciliation with paper settings and scorer code.

### What was tricky to build
- Asynchronous CUDA pointers require tensor lifetime, context and stream ownership; guide identifies these as integration contracts requiring GPU tests.

### What warrants a second pair of eyes
- Corpus materialization safety, exact ATen semantics, score parameters and benchmark integrity restrictions.

### What should be done in the future
- Complete source extraction and corpus acquisition; inspect executable evaluator and materialize dataset; implement bridge against genuine tasks.
- Every port must record upstream URL, revision, path, symbol, license, adaptation and validation evidence. No code has been ported in this step.

### Code review instructions
- Read design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md alongside the archived PassBench README and runtime/python/kiln_launch.py.

### Technical details
- CUDA smoke test used a disposable docker run --rm --gpus all invocation, with no host Python installation changes.

## Step 4: Verify complete evaluation membership and stage reference execution

The pinned Git clone completed successfully with all 200 evaluation tasks and 2,060 graph directories present. The complete Hugging Face dataset download also finished: 14 shards verified against published SHA256 metadata. These are acquisition and inventory results, not performance measurements.

### Prompt Context
See Steps 1–3 for task and provenance instructions.
**Assistant interpretation:** Execute genuine reference workloads before Kiln substitution.
**Inferred user intent:** Establish trustworthy baseline evidence.

### What I did
- Wrote sources/evaluation-inventory.json and eval-transfer-files.txt, then staged 14,620 evaluation files and the evaluator on bling.local.
- Added scripts/02-run-reference.py using the untouched evaluator with 20 warmups and 100 trials, isolated task logs, and an execution receipt.
- Inspected test_compiler.py CLI and aggregate_es_scores.py at the pinned revision.

### Why
- Reference graph membership can be proven directly from the completed checkout, independent of Parquet materialization.

### What worked
- Inventory reports 200 tasks, 2,060 graphs, zero missing sample or graph directories.
- Scorer CLI defaults p=0; sample entry.sh uses warmup 25, trials 100; evaluator CLI itself defaults warmup 3, trials 5. Explicit flags are required.
- Remote evaluator and selected graph transfers completed.

### What didn't work
- Source tarball download terminated: curl (28) Operation timed out after 120001 milliseconds with 36238715 bytes received. Completed pinned Git checkout supersedes this incomplete archive.
- Temporary uv environment creation initially failed because its default cache was read-only; using --cache-dir /tmp/passnet-uv-cache fixed creation. PyArrow download is still being observed.
- First tmux GPU smoke launch failed: permission denied while trying to connect to the docker API at unix:///var/run/docker.sock. Interactive SSH Docker had succeeded; retry uses sg docker inside the existing tmux server rather than changing socket permissions.

### What I learned
- Preserve distinct executable defaults, entry-script settings and paper settings in each run record.

### What was tricky to build
- Existing tmux sessions may retain supplementary groups from their server's startup; SSH group membership alone does not establish tmux Docker access.

### What warrants a second pair of eyes
- Baseline runner must preserve every task failure; process exit status alone does not prove numerical success.

### What should be done in the future
- Inspect smoke retry, preserve raw logs, resolve evaluator/runtime failures and run full baselines. Materialize and inspect Parquet schema once dependency download completes.

### Code review instructions
- Review scripts/02-run-reference.py, evaluation-inventory.json and source scorer/entry-script defaults.

### Technical details
- No upstream evaluator changes or compiler ports in this step.

## Step 5: Complete first reference task and start full evaluation

Verified the terminal execution receipt for the six-variant first task, archived its raw log, and launched full 200-task Inductor/eager evaluation. Started complete Parquet materialization in tmux after verifying the schema.

### Prompt Context
See Steps 1–3 for original scope and source provenance instructions.
**Assistant interpretation:** Move from environment smoke checks to genuine benchmark evidence and semantics-driven implementation.
**Inferred user intent:** Reproduce and extend the complete system, preserving experimental validity.

### What I did
- Verified reference process exit 0, elapsed 26.82248568534851 seconds, six success statuses and zero failed statuses.
- Archived sources/reference-smoke logs and receipt.
- Started remote tmux passnet-reference-full, using the untouched evaluator with 20 warmups and 100 trials.
- Inspected Parquet schema: optional string path, content, source_folder; sampled an actual file-content record.
- Started local tmux passnet-materialize with per-file SHA256 manifests and duplicate/path checks.
- Documented real first-task ReLU/inference batch_norm/disabled dropout semantics in guide section 11.

### Why
- Full evaluation and actual graph semantics establish the baseline and implementation target without substituting synthetic workloads.

### What worked
- Complete first task passed numerical and dtype checks across its six variants.
- Temporary PyArrow tooling is available at /tmp/passnet-tools; no host Python installation was modified.

### What didn't work
- No new failures in this checkpoint. Full evaluation and materialization are not yet complete.

### What I learned
- The first task requires inference batch normalization and tuple output semantics, including FP16/BF16 behavior.

### What was tricky to build
- Dataset path prefixes differ from benchmark checkout layout; materialization preserves original paths rather than inventing a mapping before corpus inspection.

### What warrants a second pair of eyes
- Batch normalization channel broadcasting and intermediate precision must match PyTorch. No port has yet been implemented.

### What should be done in the future
- Poll both live tmux workloads; analyze full results with official scoring, then implement the typed FX importer and CUDA bridge.

### Code review instructions
- Review scripts/03-materialize-dataset.py and sources/reference-smoke; compare guide section 11 with pinned model.py.

### Technical details
- Full evaluation compares each compiled graph to eager within the original evaluator, preserving its checks. Hardware/software deviations remain as documented in Step 3.

## Step 6: Implement the first FX serialization boundary

Added integrations/passnet/fx_export.py, an independent implementation using PyTorch FX metadata propagation and node APIs. It preserves argument/container structure and exact ATen overloads, and rejects unsupported captured constants rather than silently dropping them. This is the first integration component; it does not yet compile graphs through Kiln.

### Prompt Context
See Step 3 for source/port provenance requirements.
**Assistant interpretation:** Establish an explicit graph representation before importer implementation.
**Inferred user intent:** Preserve semantics and make compiler extensions reviewable.

### What I did
- Added kiln-fx/1 export with node identities, targets, args/kwargs, shape/dtype/stride metadata and nested output structure.
- Added CPU tests for broadcasting metadata, nested tuple/dict outputs and explicit get_attr rejection.
- Verified reference-full live with first task receipt progress; materializer processed first shard, 147,701 records and zero duplicates at observation.

### Why
- A typed boundary prevents implicit guesses about FX overloads and tensor layout.

### What worked
- Local PyTorch 2.11.0+cu130 is available for CPU FX validation; no installation required.

### What didn't work
- No new failure diagnostics at authoring time. Full graph import, constants and CUDA execution are still pending.

### What I learned
- ShapeProp executes graph code; use only trusted graphs in the evaluation environment.

### What was tricky to build
- Namedtuple tensor metadata must be recognized before generic tuple handling. Output containers and node references use explicit tags to avoid ambiguity.

### What warrants a second pair of eyes
- Stable target names and unsupported metadata/value classes must remain explicit as corpus coverage expands.

### What should be done in the future
- Add constants and real graph export, implement Kiln importer, and verify the same numerical semantics end to end.

### Code review instructions
- Run python3 -m unittest discover -s integrations/passnet -p 'test_*.py'.

### Technical details
- Source provenance: public PyTorch FX Node/GraphModule/ShapeProp APIs, local runtime 2.11.0+cu130. No upstream source copied or adapted. ATen OpOverload uses its qualified string name.

## Step 7: Implement initial typed FX to Kiln project lowering

Added fx_import.py as the next integration component. It emits Kiln project source for supported FP32 elementwise targets and preserves output container structure separately from flattened program outputs. This checkpoint has CPU structural validation only; no generated script compilation or GPU correctness is claimed yet.

### Prompt Context
See Step 3 for source provenance and full implementation scope.
**Assistant interpretation:** Implement semantic translation incrementally, with explicit coverage failures.
**Inferred user intent:** Build a complete measured compiler integration rather than silently narrow the benchmark.

### What I did
- Added node reference resolution, duplicate/forward reference diagnostics, static contiguous FP32 input checks and explicit unsupported-target errors.
- Mapped ReLU, exp, sqrt and selected add/mul/sub/div targets to Kiln N operations.
- Flattened tensor outputs with a separate tuple/list/dictionary structure manifest.
- Added tests for ReLU/add broadcasting, nested output structure, dtype rejection and stride rejection.

### Why
- Emitting source through the existing project/compiler path avoids introducing a second compiler pipeline while preserving a reviewable input artifact.

### What worked
- python3 -m unittest discover -s integrations/passnet -p 'test_*.py': four tests passed.
- Full reference benchmark live at three completed tasks during observation.
- Materializer reached 443,103 records across three shards, zero duplicates at observation.
- Supported Node and pnpm are available on bling.local.

### What didn't work
- No new failures; actual Kiln script compilation and CUDA integration validation are pending.

### What I learned
- FX output tuples and lists must remain distinct through lowering; using one generic sequence representation would change return semantics.

### What was tricky to build
- Generated variable names use internal indices rather than source identifiers; output containers are represented independently from Kiln's named program outputs.

### What warrants a second pair of eyes
- Operator-specific kwargs, intermediate type/shape equivalence and full ATen promotion semantics need broader validation before coverage expands.

### What should be done in the future
- Compile emitted project scripts using supported Node, add batch_norm semantics and CUDA/PyTorch runtime bridge, then validate genuine benchmark tasks including FP16/BF16.

### Code review instructions
- Review integrations/passnet/fx_import.py and test_fx_import.py alongside packages/kiln/src/std/tensor.js N definitions.

### Technical details
- Independent implementation against existing Kiln N API; no upstream source copied. Current dtype/layout restrictions are temporary coverage errors, not benchmark filtering policy.

## Step 8: Verify first FX/Kiln/CUDA/PyTorch execution round-trip

Compiled the importer-generated ReLU/broadcast-add script through the actual Kiln export CLI using supported Node on bling.local. Implemented the initial TorchProgram execution bridge and verified CUDA numerical output on default and non-default streams. This is a real GPU integration result, but still a synthetic graph rather than a matched/scored PassBench task.

### Prompt Context
See prior steps for full benchmark and upstream provenance requirements.
**Assistant interpretation:** Validate executable compiler/runtime boundaries before expanding graph coverage.
**Inferred user intent:** Establish correctness with measured execution evidence.

### What I did
- Staged current Kiln source on DGX Spark and installed frozen pnpm dependencies with lifecycle scripts disabled.
- Exported generated script using scripts/kiln-export.mjs --target a100; compiler end-to-end check passed at loop level.
- Added integrations/passnet/runtime.py and smoke_cuda.py. Bridge validates input metadata, allocates outputs and per-call scratch, preserves input/output aliases, and passes current stream and caller-owned pointers.
- Executed CUDA smoke with original Kiln launcher via PYTHONPATH, without copying or modifying launcher source.

### Why
- GPU checks resolve uncertainty left by CPU serialization tests and reference interpretation.

### What worked
- Export succeeded with one kernel. GPU smoke exited 0 and printed PASS on default and non-default streams at FP32 rtol 1.3e-6, atol 1e-5.
- Reference baseline advanced to four completed tasks at observation; materialization advanced through four shards.

### What didn't work
- No new failures. PassBench matcher/scorer, real-task batch_norm and reduced precision remain pending.

### What I learned
- Existing Kiln NVRTC launcher can consume PyTorch pointers on GB10 without a custom compiled extension for this workload.

### What was tricky to build
- Scratch must be per invocation and recorded on its execution stream. Outputs aliasing inputs must reuse storage rather than allocating a different pointer.

### What warrants a second pair of eyes
- Multi-kernel and concurrent-stream lifetime behavior, context selection and program close while work is outstanding require further validation.

### What should be done in the future
- Complete genuine task lowering and integrity-compatible PassBench integration, then report official correctness/score and runtime overhead.

### Code review instructions
- Review runtime.py and smoke_cuda.py with runtime/python/kiln_launch.py; inspect sources/kiln-cuda-smoke.txt for exact evidence limits.

### Technical details
- Bridge independently implemented against existing Kiln launcher and public PyTorch storage/stream APIs. No PyTorch or PassNet source copied. a100 controls scheduling only; NVRTC compiles for detected SM121.

## Step 9: Lower genuine task inference batch normalization

Implemented FP32 inference batch_norm lowering with channel-vector reshaping and disabled-dropout identity. Exported the first genuine task from its pinned model.py using CPU FX. Actual Kiln export rejected the generated graph at its end-to-end check; this failure remains unresolved and must not be bypassed to claim correctness.

### Prompt Context
See Step 3 for provenance requirements.
**Assistant interpretation:** Expand semantics to the real benchmark graph.
**Inferred user intent:** Verify the complete integration rather than a synthetic substitute.

### What I did
- Added explicit inference-only batch_norm and non-inplace disabled dropout handling to fx_import.py.
- Validated channel dimensions and epsilon; training batch_norm remains an explicit unsupported case.
- Exported actual FP32 batch-eight LINKX graph into sources/first-task-fp32.kiln.js.

### Why
- Batch normalization is required by the first verified PassBench task.

### What worked
- Four existing CPU tests passed; source FX export and importer translation succeeded.
- Materialization reached six shards and 886,206 records during observation.

### What didn't work
- On bling.local: node scripts/kiln-export.mjs --script ../first-task-fp32.kiln.js --target a100 --out ../first-task-fp32.json exited 1 with `: end-to-end check FAILED`.

### What I learned
- endToEnd calls project.inputsFor then compares graph and lowered outputs. Need inspect generated inputs and numerical mismatch, including whether running variance violates its nonnegative domain. This is a hypothesis, not established cause.

### What was tricky to build
- Channel vector reshaping must match rank-dependent axis-one normalization; source kwargs and positional arguments must be bound without silent duplication.

### What warrants a second pair of eyes
- FP32 intermediate rounding and fused arithmetic differences; dropout kwargs validation and non-FP32 support remain incomplete.

### What should be done in the future
- Diagnose failed compiler reference check using actual valid task metadata; add targeted numerical tests and validate GPU before PassBench matching.

### Code review instructions
- Inspect fx_import.py batch_norm branch and archived first-task-fp32.kiln.js. Do not treat four existing tests as batch_norm validation.

### Technical details
- Independent mathematical inference lowering; source model revision 61c64709f6d324216ae8252cec3cdc35b2dd5da5. No upstream implementation code copied.

## Step 10: Resolve reference input domain and verify real-task CUDA semantics

The genuine graph exported successfully after providing valid test data matching its running-statistics domain. A separate CUDA test used nontrivial running mean, positive variance, weight and bias; this passed the original FP32 tolerance with maximum absolute error 9.5367431640625e-07. This is not yet a PassBench matched/scored result.

### Prompt Context
See Step 9.
**Assistant interpretation:** Diagnose the failure with valid source-domain inputs and verify numerical behavior independently.
**Inferred user intent:** Fix real failures without bypassing validation.

### What I did
- Inspected Project.inputsFor: unspecified tensors receive generic uniform random values, without batch_norm domain constraints.
- Added explicit project data to sources/first-task-fp32.kiln.js: running mean/bias zero, variance/weight one, seeded activation.
- Re-ran unmodified export validation; it passed at loop level and exported two kernels.
- Added smoke_batch_norm.py with random nontrivial positive variance and affine inputs on GB10.

### Why
- Running variance must be nonnegative; generic compiler inputs do not express the benchmark's input constraints.

### What worked
- Export exited 0 with end-to-end check ok at loop.
- CUDA test exited 0 at rtol 1.3e-6 and atol 1e-5; max absolute error 9.5367431640625e-07.

### What didn't work
- Earlier unconstrained reference check failed as recorded in Step 9; no check was disabled. The generic generator's invalid variance is consistent with the repaired result; per-element NaN diagnostics were not archived, so causal attribution remains limited to this controlled input change.

### What I learned
- Imported programs need source-domain example data/constraints for compiler checking, distinct from runtime graph semantics.

### What was tricky to build
- Valid constant-like example data must not specialize runtime statistics away; GPU validation therefore used nontrivial randomized statistics and affine parameters.

### What warrants a second pair of eyes
- Reduced precision, graph matcher/integrity compatibility, and broader shape/layout support remain unverified.

### What should be done in the future
- Add reusable constraint/example-data transport and match/score genuine tasks in PassBench.

### Code review instructions
- Review fx_import.py, smoke_batch_norm.py and first-task-fp32.kiln.js, with source graph provenance in Step 9.

### Technical details
- Original graph shape [1000,128], 128 channels; tested CUDA runtime container and compiler environment as Step 8. No upstream code copied.

## Step 11: Preserve intermediate procedures as reproducible scripts

Saved the previously interactive first-task export procedure as scripts/04-export-first-task.py and added a read-only progress inspection script. Future temporary diagnostic and experiment scripts will remain in this ticket scripts directory so reports can reference exact procedures. Reusable integration code remains tracked under integrations/passnet.

### Prompt Context
**User prompt (verbatim):** "save termporary intermediate scripts as well, in the scripts/ folder, so we can track your progress later on for our reports"
**Assistant interpretation:** Preserve investigation procedures rather than leaving them only in tool-call history.
**Inferred user intent:** Reconstruct implementation and experimental progress for later technical reports.

### What I did
- Added numbered export and observation scripts plus scripts/README.md.
- Export script emits both kiln-fx/1 JSON and the compiler project with valid statistics.

### Why
- Reports need runnable procedures as well as narrative results.

### What worked
- Existing tracked download, baseline and materialization scripts already satisfy this convention; first-task export is now reproducible from its pinned source.

### What didn't work
- No new failures.

### What I learned
- Saved reconstruction is explicitly labeled as such; it must not be presented as the byte-identical original shell transcript.

### What was tricky to build
- Repository discovery uses actual integration file presence so invocation does not depend on working directory.

### What warrants a second pair of eyes
- Future experiment scripts must preserve immutable inputs and exact settings, including runtime image identity.

### What should be done in the future
- Continue matcher/scorer integration and preserve every intermediate diagnostic in scripts.

### Code review instructions
- Run scripts/04-export-first-task.py with PyTorch; inspect emitted FX JSON and script.

### Technical details
- No upstream code copied; the script loads the pinned upstream GraphModule explicitly.

## Step 12: Exercise untouched PassBench pass interface

Added reproducible pass-module generation and original-evaluator launch scripts. The first integration attempt failed pattern matching before replacement execution. This is useful boundary evidence, not a successful benchmark result.

### Prompt Context
See Step 11: preserve intermediate scripts for reports.
**Assistant interpretation:** Validate original matcher and integrity behavior without evaluator edits.
**Inferred user intent:** Obtain scientifically valid end-to-end scoring.

### What I did
- Added scripts/06-write-pass-module.py and 07-run-passbench-fp32.sh; generated stable module-level replacement function using existing TorchProgram.
- Ran original pass_mgr on the genuine first FP32 graph in remote tmux passnet-kiln-match.
- Archived full sources/kiln-match.log.

### Why
- CUDA correctness alone does not prove matcher/evaluator compatibility.

### What worked
- Pass module loaded; original evaluator ran and preserved failure diagnostics.
- Materialization reached 1,624,710 records in observation; baseline reached six task completions.

### What didn't work
- `[PassMgrBackend] Pass KilnBatchNorm failed to match.`
- `RuntimeError: [PassMgrBackend] No passes modified the graph.`
- Original evaluator marked compiled execution failed. No fallback or integrity bypass was added.

### What I learned
- Need inspect actual Dynamo graph and traced pattern before modifying the pattern.
- GPU smoke/integration runs overlapped the exploratory full baseline. Existing performance results cannot support controlled final comparisons; rerun isolated before claims.

### What was tricky to build
- Source-level operation equivalence is not sufficient for exact FX matcher structure and kwargs.

### What warrants a second pair of eyes
- Matcher normalization and replacement callable acceptance remain unverified.

### What should be done in the future
- Save graph inspection diagnostic script, resolve pattern mismatch, then execute original integrity/correctness/scoring paths.

### Code review instructions
- Inspect scripts/06 and 07 with sources/kiln-match.log and original pass_mgr_backend.py.

### Technical details
- No upstream evaluator code changed or copied. Runs are explicitly exploratory and non-isolated.

## Step 13: Identify exact pattern mismatch

Saved and ran scripts/08-inspect-fx-pattern.py, capturing symbolic pattern and Dynamo graphs without evaluator modifications. The matcher mismatch is structural: symbolic_trace canonicalizes batch_norm to kwargs and inserts dropout inplace=False, while Dynamo retains positional batch_norm arguments and omits the dropout default.

### Prompt Context
See Step 11 for intermediate-script preservation.
**Assistant interpretation:** Diagnose from exact graph evidence.
**Inferred user intent:** Fix integration faithfully.

### What I did
- Captured node targets, args and kwargs in sources/fx-pattern.log using the existing remote PyTorch container.

### Why
- Mathematically equivalent source code does not guarantee exact FX structural equivalence.

### What worked
- Diagnostic completed successfully and reproduced MATCHES 0.

### What didn't work
- Existing generated pass still cannot match. Replacement correctness/integrity execution remains untested.

### What I learned
- Pattern trace has batch_norm args (relu,mean,variance), kwargs weight/bias/training/momentum/eps; Dynamo has eight positional args and no kwargs.
- Pattern dropout includes inplace=False; Dynamo does not.

### What was tricky to build
- Need produce structurally faithful pattern without changing original evaluator or weakening matching.

### What warrants a second pair of eyes
- Any explicit FX pattern construction must retain documented pass function signature and argument mapping.

### What should be done in the future
- Implement exact graph pattern construction and rerun the original evaluator; preserve all failures.

### Code review instructions
- Compare scripts/08-inspect-fx-pattern.py and sources/fx-pattern.log with scripts/06-write-pass-module.py.

### Technical details
- Independent diagnostic uses public FX SubgraphMatcher and torch.compile backend callback. No upstream code modified or copied.

## Step 14: Preserve original integrity rejection and complete corpus extraction

Explicit FX pattern construction was rejected by the untouched evaluator AST validator before matching. No rejection was bypassed. Completed materialization now reports 2,067,810 file-content records from 14 verified shards and zero duplicate records; committed a compact summary while retaining full per-file manifest in sources/materialized.

### Prompt Context
See Step 11 for intermediate-script and evidence preservation.
**Assistant interpretation:** Determine legal integration boundaries and retain untouched reference behavior.
**Inferred user intent:** Produce trustworthy reproducible evaluation.

### What I did
- Updated scripts/06 to construct exact observed FX argument structure and retain original pattern argument signature.
- Ran original evaluator retry in tmux passnet-kiln-match-v2 and archived sources/kiln-match-v2.log.
- Recorded complete materialization summary.

### Why
- Exact structural graph construction resolves trace normalization conceptually but must also satisfy benchmark integrity policy.

### What worked
- Corpus materialization completed all 14 shards without conflicts.

### What didn't work
- Original validator: Line 12 blocked call torch.fx.Graph; Line 18 blocked call torch.fx.GraphModule.
- Evaluator then raised RuntimeError: No replacement functions available after filtering 0 rules.

### What I learned
- Explicit pattern objects supported by matcher internals are forbidden by source-level validation in generated passes. This is a protocol limitation, not numerical failure.

### What was tricky to build
- Pattern construction and replacement execution need separate integrity policies if the integration uses trusted compiler tooling. Hiding constructors behind imports would not establish legitimate compliance.

### What warrants a second pair of eyes
- Any integration-specific evaluator changes need explicit scope and must remain labeled a modified evaluation protocol, with original reference checks preserved.

### What should be done in the future
- Investigate sanctioned normalized pattern interfaces; if necessary design a separate audited integration mode without weakening numerical, dispatch or reverse-order checks.
- Complete remaining intern guide, reMarkable delivery and milestone vault reports alongside implementation.

### Code review instructions
- Inspect scripts/06 and sources/kiln-match-v2.log against pinned pass_bench/ast_util/validate_pass_source.py.

### Technical details
- No upstream evaluator mutation or AST bypass performed. Existing generated pass remains rejected and cannot support a benchmark-success claim.

## Step 15: Deliver intern guide progress edition

Expanded the guide with verified GPU results, failed matcher attempts, complete corpus acquisition and remaining requirements. Delivered a distinctly named progress edition to reMarkable, preserving existing documents and annotations.

### Prompt Context
Original goal requests an intern guide stored in ticket and uploaded to reMarkable.
**Assistant interpretation:** Deliver current useful research while retaining full implementation scope.
**Inferred user intent:** Read the technical design on device during ongoing work.

### What I did
- Added guide sections 13–14 on verified CUDA execution, input constraints, integrity boundary, corpus completion and non-isolated exploratory measurement limitations.
- Used remarkable-upload skill and a new document name: KILN-005 PassNet Intern Guide Progress 01.

### Why
- This is a substantive research/implementation milestone worth making available for review now.

### What worked
- remarquee upload bundle exited 0: OK: uploaded KILN-005 PassNet Intern Guide Progress 01.pdf -> /ai/2026/10/30/KILN-005.

### What didn't work
- No upload failures. Final implementation, original-protocol scoring and final guide remain incomplete.

### What I learned
- Cloud upload success proves delivery to the account, not physical device synchronization.

### What was tricky to build
- Progress edition must preserve failed experiment evidence and distinguish GPU correctness from benchmark acceptance.

### What warrants a second pair of eyes
- Intern clarity and proposed integrity protocol need review as implementation expands.

### What should be done in the future
- Write milestone vault report, commit/push only task-related vault notes, and continue implementation/measurements.

### Code review instructions
- Read guide sections 13–14 and sources/remarkable-progress-01-receipt.txt.

### Technical details
- No force overwrite, no evaluator edits, no new performance claims.

## Step 16: Publish first technical milestone report to the vault

Wrote a technical article explaining corpus provenance, FX semantics, CUDA storage/stream ownership, genuine-task numerical evidence and the unresolved original-protocol integrity boundary. Copied it as a new dated vault note, committed only that file, and pushed successfully.

### Prompt Context
Original goal requests milestone textbook-style technical reports and vault commit/push.
**Assistant interpretation:** Publish evidence-backed explanation of the first substantive implementation milestone.
**Inferred user intent:** Preserve reusable technical understanding and project progress.

### What I did
- Used obsidian-vault-writing and textbook-authoring skills; followed existing article frontmatter convention.
- Added ticket reference/02-milestone-report-fx-to-cuda.md and vault Projects/2026/10/30/ARTICLE - PassNet and Kiln - From FX Semantics to CUDA Execution.md.

### Why
- GPU correctness and evaluator incompatibility are distinct outcomes requiring a coherent technical account.

### What worked
- Vault commit 2c3cc7f; push succeeded main -> main, ba76161..2c3cc7f.

### What didn't work
- No publication failure. Unrelated existing vault modifications remain untouched.

### What I learned
- Publication records need to retain incomplete experiment status rather than implying final reproduction.

### What was tricky to build
- Explained file/graph/task counts and original versus modified protocol without conflating evidence scopes.

### What warrants a second pair of eyes
- Report numerical claims and code references are bounded to verified evidence; full reproduction remains outstanding.

### What should be done in the future
- Continue integration, isolated measurements and further milestone reports.

### Code review instructions
- Read the new article and compare with prior diary entries and raw sources logs.

### Technical details
- Append-only vault addition; task-specific staging only; successful remote push verified from command result.

## Step 17: Census complete evaluation requirements

Added and executed a static AST census over all 200 tasks and 2,060 graphs. This provides explicit operation/dtype requirements for extending Kiln beyond the initial bridge. It does not narrow the goal to supported cases.

### Prompt Context
User authorizes implementing missing Kiln pieces and preserving intermediate scripts.
**Assistant interpretation:** Ground capability priorities in the actual evaluation corpus.
**Inferred user intent:** Implement broad support with traceable requirements.

### What I did
- Added scripts/09-inventory-operators.py and sources/operator-inventory.json.
- Counted calls, normalized tensor methods, arithmetic/subscript syntax and input/weight dtypes; updated guide section 15.

### Why
- Operator names and dtype needs must come from the pinned evaluation set rather than preliminary assumptions.

### What worked
- Census covered 200 tasks and 2,060 graphs. FP16/BF16/FP32 metadata occurs in 728/733/569 graphs; int64 in 170, bool in three (nonexclusive).
- Full reference run remains live, with seven task completions observed.

### What didn't work
- First draft counted only calls and retained temporary receiver names; inspection showed it omitted Python arithmetic and fragmented method counts. Corrected census before committing.

### What I learned
- conv2d, concatenation, indexing, views, reductions and embeddings require major new capability work. Static syntax counts are not dynamic kernel counts.

### What was tricky to build
- Negative literals and slice constructors must not be mistaken for runtime tensor operations; census retains raw syntax categories explicitly.

### What warrants a second pair of eyes
- Dtype metadata counts overlap and do not characterize intermediate promotion. AST receiver normalization assumes non-torch attribute calls are tensor-like; inspect per-graph records before treating counts as definitive semantic coverage.

### What should be done in the future
- Build task-dependency coverage matrix and implement dtype/storage/layout extensions with end-to-end tests; continue matcher resolution.

### Code review instructions
- Run scripts/09-inventory-operators.py and inspect inventory plus guide section 15.

### Technical details
- Standard-library AST only; no upstream source execution or implementation copying.

## Step 18: Implement explicit integration-protocol argument normalization

Added a narrow FX normalization component rather than hiding forbidden graph constructors in generated passes. It binds public function signatures and fills defaults for ReLU/batch_norm/dropout; target and pattern receive identical treatment. This is a declared protocol modification, not an original benchmark result.

### Prompt Context
Original goal requests faithful reproduction and separate Kiln integration; preserve integrity and provenance.
**Assistant interpretation:** Resolve a structural representation mismatch without relaxing semantic or numerical checks.
**Inferred user intent:** Build an auditable experiment that identifies compiler effects.

### What I did
- Added fx_normalize.py and tests for matching, exact output preservation, idempotence and invalid-call rejection before mutation.
- Documented modified protocol in guide section 16.

### Why
- Original symbolic trace and Dynamo differ in optional-argument representation. Equivalent canonicalization of both graphs is reviewable; source-constructor hiding is not.

### What worked
- Tests cover observed first-task pattern versus Dynamo-style graph and preserve tensor output on valid inference inputs.

### What didn't work
- Full evaluator integration not yet run; numerical/dispatch acceptance of launcher remains unproven.

### What I learned
- Matching normalization should operate before replacement and produce its own receipt.

### What was tricky to build
- Signature binding must finish for all calls before mutating graph arguments, so invalid calls do not leave partial edits.

### What warrants a second pair of eyes
- Public signature defaults across pinned software versions; graph keyword metadata and unsupported callable categories.

### What should be done in the future
- Wire normalization into a separately labeled integration harness, restore ordinary generated pattern source and execute original integrity/correctness checks.

### Code review instructions
- Run python3 -m unittest discover -s integrations/passnet -p 'test_*.py'. Review fx_normalize.py and guide section 16.

### Technical details
- Independent implementation using inspect.signature and public FX graph APIs; no upstream code copied or original evaluator edited.

## Step 19: Match genuine graph under declared normalized protocol

Implemented evaluate_normalized.py, a process-local integration entry point that normalizes target and pattern arguments before delegating to the original pass. Restored the ordinary generated pattern so original AST validation runs unchanged. Matching now succeeds, but original dispatch checking rejects stream-lifetime bookkeeping.

### Prompt Context
See Steps 18 and 11 for protocol and script preservation requirements.
**Assistant interpretation:** Execute complete validation and preserve the next boundary failure.
**Inferred user intent:** Retain integrity while establishing real task execution.

### What I did
- Added explicit kiln-normalized-fx/1 protocol marker and node-normalization receipts.
- Ran saved generator and evaluator launch scripts in tmux passnet-normalized.
- Archived sources/normalized-match.log.

### Why
- Separate trusted graph normalization from generated pass code without modifying original checkout files.

### What worked
- Original source validation accepted ordinary pass. Matcher logged Applied 1 replacements with KilnBatchNorm.

### What didn't work
- Original dispatch guard rejected aten.record_stream.default: Unauthorized Operator, not in PosionDispatchTensor whitelist. Evaluator status failed.

### What I learned
- Required stream-storage lifetime bookkeeping is outside current benchmark whitelist. This is distinct from forbidden arithmetic delegation.

### What was tricky to build
- Harness delegates to original matcher/checker and changes only process-local class ownership, with explicit modified-protocol marker.

### What warrants a second pair of eyes
- Any proposed record_stream allowance must be narrow and audited; do not disable dispatch globally or remove required lifetime tracking.

### What should be done in the future
- Design/test an explicit metadata-only stream-lifetime allowance within declared integration protocol; preserve original guard for all tensor arithmetic.

### Code review instructions
- Inspect evaluate_normalized.py and normalized-match.log; run integration unit tests.

### Technical details
- No original evaluator files edited. Modified matching is not exact paper reproduction. CUDA execution failed before accepted correctness/scoring.

## Step 20: Complete first scored genuine-graph integration round-trip

The genuine FP32 graph matched, executed Kiln CUDA, passed original numerical/dtype checking and produced an official scorer artifact under the declared modified protocol. The protocol includes argument normalization and a narrow record_stream metadata allowance. These results are exploratory, single-graph, non-isolated measurements, not paper reproduction or full-task coverage.

### Prompt Context
Original goal requires complete measured round-trip; preserve protocol changes explicitly.
**Assistant interpretation:** Retain storage lifetime safety and arithmetic integrity simultaneously.
**Inferred user intent:** Establish verifiable end-to-end evaluation.

### What I did
- Added dispatch_policy.py allowing only aten.record_stream.default; all other calls delegate to original guard.
- Added check_dispatch_policy_cuda.py and ran it remotely: metadata allowed, torch.add still rejected.
- Reran original numerical checker through declared normalized harness; one replacement, status success.
- Added scripts/10-score-integration.sh and archived stream-policy.log and stream-policy-score.json.

### Why
- record_stream tracks allocator lifetime; removing it would compromise asynchronous safety. Its explicit allowance does not authorize tensor arithmetic.

### What worked
- Guard test PASS; original dtype/numerical checks success.
- Official scorer p=0, fpdb=0.1 exited 0; aggregated_speedup=0.8492896391830824 for this one graph. Raw e2e speedup 0.84990, GPU speedup 0.83106.

### What didn't work
- First scorer invocation failed KeyError: validation because it derives curve identity from log basename. Copying unchanged log to normalized-protocol-score/validation.log satisfied its expected input contract.

### What I learned
- Scorer aggregate is distinct from raw timing speedup and strictest tolerance levels still have penalties.

### What was tricky to build
- Metadata dispatch extension unwraps only the record_stream tensor; all other operations retain original guarded behavior.

### What warrants a second pair of eyes
- Policy tests cover one forbidden arithmetic call; broader integrity regression and concurrent lifetime tests are still needed.

### What should be done in the future
- Extend dtype/shape coverage, isolate final timing runs, test full integrity contract, run agent/meta-optimization experiments and publish milestone updates.

### Code review instructions
- Review dispatch_policy.py, evaluate_normalized.py, GPU guard check and archived logs/score. Do not call this original-protocol success.

### Technical details
- Original source checkout unchanged. Process-local integration policy marker kiln-dispatch-record-stream/1, matching marker kiln-normalized-fx/1. No upstream implementation copied.

## Step 21: Map reduced-precision compiler implementation boundaries

Inspected actual dtype handling across core types, reference utilities, kernel materialization, CUDA/WGSL emitters, program identity, export and Python runtime. Added a dedicated design document rather than removing FP32 input validation prematurely.

### Prompt Context
User authorizes implementing missing Kiln capabilities with design docs and source provenance.
**Assistant interpretation:** Define correct end-to-end precision semantics before storage/codegen edits.
**Inferred user intent:** Support the real corpus without silent dtype corruption.

### What I did
- Added design-doc/02-typed-storage-and-reduced-precision-compiler-extension.md with file-level evidence, phased changes, invariants and validation gates.

### Why
- Non-FP32 pointers currently become float pointers and outputs are unconditionally f32. Superficial runtime casts would implement a different computation.

### What worked
- Identified concrete dtype omissions at materialization, emit, artifact size, output identity and host packing boundaries.

### What didn't work
- No new execution failures; reduced precision remains unimplemented.

### What I learned
- Both CUDA and WGSL are emitted; CUDA-only support requires explicit backend capability handling.

### What was tricky to build
- Storage dtype, arithmetic precision and source-observable intermediate rounding are separate contracts.

### What warrants a second pair of eyes
- Conversion movement across fusion, accumulation dtype, identity versioning and backend availability.

### What should be done in the future
- Archive authoritative precision/conversion references, implement typed dtype contract and reference conversions, then propagate storage/output types through all layers.

### Code review instructions
- Read new design against std/emit.js, std/export.js, std/kernel.js, std/program.js, core/util.js and runtime/python/kiln_launch.py.

### Technical details
- No upstream implementation copied and no claimed low-precision support in this checkpoint.

## Step 22: Implement dtype storage widths and reference rounding

Added the first shared compiler dtype component: explicit storage widths and FP32-to-FP16/BF16 reference conversions. This does not enable reduced-precision emitted programs yet. Replaced util.js's permissive non-u8-is-four-bytes fallback with the explicit table.

### Prompt Context
User authorizes missing Kiln compiler implementation with design/provenance records.
**Assistant interpretation:** Implement reference storage/rounding foundation before typed codegen.
**Inferred user intent:** Preserve precision semantics across all compiler layers.

### What I did
- Added core/dtypes.js: width table, unknown-type rejection, FP16/BF16 bit encode/decode and roundToDtype.
- Added tests exhausting every finite 16-bit encoding, midpoint ties, subnormals, overflow, NaN and signed zero.
- Re-exported dtypeBytes from core/util.js so existing compiler consumers use the authoritative widths.

### Why
- Correct artifact sizes and typed reference evaluation require an explicit storage contract.

### What worked
- node --test packages/kiln/test/dtypes.test.js exited 0; all finite encoding roundtrips and boundary assertions passed.

### What didn't work
- No failures in targeted validation. Existing full compiler suite and PyTorch cross-reference vectors remain pending.

### What I learned
- Integer/Boolean storage widths are needed by corpus indexing even though floating arithmetic is the immediate target.

### What was tricky to build
- FP16 subnormal rounding must include midpoint ties and carry into minimum normal. BF16 rounding needs NaN handling before integer bias addition.

### What warrants a second pair of eyes
- Conversion entry rounds JavaScript numbers through FP32 before reduced precision; this is an explicit FP32 conversion contract, not arbitrary double-to-half semantics.

### What should be done in the future
- Cross-check reference vectors with PyTorch, run supported-Node compiler tests and propagate typed outputs/precision boundaries through lowerings.

### Code review instructions
- Inspect core/dtypes.js and test/dtypes.test.js, then run the targeted Node test.

### Technical details
- Independent bit-format implementation; no upstream code copied. Backend capability support is separate from storage-width recognition.

## Step 23: Differential-check reduced-precision conversions against PyTorch

Saved reproducible reference-vector generation and validation scripts. Kiln conversions matched PyTorch for all 46,162 checked conversions from 23,081 FP32 bit patterns, including sampled half midpoints and neighboring values. NaN payload/sign canonicalization is explicitly outside exact bit comparison.

### Prompt Context
**User prompt (verbatim):** "feel free to port kiln to typescript if that makes things a bit clearer, as we build up"
**Assistant interpretation:** TypeScript migration is authorized where useful, while maintaining implementation progress.
**Inferred user intent:** Improve clarity of growing compiler contracts.

### What I did
- Added scripts/11-generate-rounding-vectors.py and 12-check-rounding-vectors.mjs, source vectors and receipt.
- Renamed dtype test to dtypes.mjs so the repository runner discovers it.
- Started full compiler regressions remotely under supported Node and pinned dependencies.

### Why
- Exhaustive self-roundtrips alone do not establish agreement with independent reference conversions.

### What worked
- PyTorch 2.11.0+cu130 reference: 23,081 vectors, 46,162 conversions passed.

### What didn't work
- Local broad suite could not import @kiln/evidence due missing workspace dependencies; Node was also unsupported v24.18.0. Remote supported-environment run supersedes this setup failure and is still being observed.

### What I learned
- Repository suite discovers .mjs test files; keep new tests in its actual discovery contract.

### What was tricky to build
- Preserve FP32 bit identity through JSON, including infinities and NaNs, by serializing integer bit patterns rather than JSON floating values.

### What warrants a second pair of eyes
- NaN tests require nonzero payload but intentionally ignore payload and sign equality. Conversion contract starts from FP32.

### What should be done in the future
- Inspect remote regression completion, extend typed IR/output codegen, and use TypeScript where it clarifies contracts.

### Code review instructions
- Run numbered scripts 11 and 12; inspect sources/rounding-check.json and core/dtypes.js.

### Technical details
- Fixed seed 42; independent implementation, PyTorch used as CPU differential oracle only. No source code ported.

## Step 24: Install supported local Node and implement typed CUDA storage emission

Installed Node v26.13.0 with nvm after user authorization. Added CUDA emitter support for half and bfloat16 input/output storage, explicit FP32 load conversions and round-to-nearest output conversions. This is emitter-level support only; typed graph lowering and export remain incomplete.

### Prompt Context
**User prompt (verbatim):** "you should be able to use `nvm use v26` locally. you are allowed to install it if it makes development easier"
**Assistant interpretation:** Use/install supported local runtime.
**Inferred user intent:** Reduce remote-only development friction.

### What I did
- nvm install v26 downloaded/checksummed Node v26.13.0 successfully.
- Modified std/emit.js to recognize f16/bf16 storage and include CUDA headers only as needed.
- Added cuda-dtypes.mjs for typed pointer/load/store emission and unknown-dtype rejection.

### Why
- Reduced-precision pointers cannot be treated as float pointers; output rounding must be explicit.

### What worked
- Node installation success; focused emitter test passed after correcting test index representation.

### What didn't work
- Initial nvm use v26: version not installed; resolved by installation.
- pnpm install failed ERR_PNPM_NO_MATCHING_VERSION for @pnpm/linux-x64@12.4.1. Project package-manager pin unchanged; local dependencies remain unavailable.
- First emitter fixture used floating expression shape for integer index, causing TypeError reading t in ix.js. Corrected fixture to index constant {t:c,v:0}; emitter then passed.

### What I learned
- CUDA storage recognition and graph-level precision semantics are separate completion gates.

### What was tricky to build
- Preserve unchanged FP32 code emission while inserting only necessary CUDA conversion headers/intrinsics.

### What warrants a second pair of eyes
- NVRTC include resolution, actual GPU conversion behavior and unsupported WGSL types require integration tests.

### What should be done in the future
- Compile typed kernels on GB10, run regressions, propagate output dtype/rounding boundaries and resolve local package manager setup without pin changes.

### Code review instructions
- Inspect std/emit.js and test/cuda-dtypes.mjs; run focused test with Node 26.

### Technical details
- Independent emitter implementation using standard CUDA half/bfloat16 type/intrinsic names; no upstream source copied. No end-to-end reduced-precision execution claim.

## Step 25: Validate typed CUDA storage on GB10 and explicit header configuration

Emitter-generated half and bfloat16 copy kernels compiled through NVRTC and executed on GB10 with exact finite storage roundtrips. Added explicit include_paths configuration to the CUDA launcher after actual missing-header failure. This remains a standalone emitter/runtime test, not full typed graph lowering.

### Prompt Context
Original implementation scope and explicit environment-read notification constraint.
**Assistant interpretation:** Test emitted CUDA rather than relying on source string assertions.
**Inferred user intent:** Verify real hardware behavior and preserve diagnostics.

### What I did
- Saved scripts/13-generate-typed-kernels.mjs and generated CUDA sources.
- Added check_typed_cuda.py with PyTorch half/BF16 pointers, infinity/NaN and exact finite-bit checks.
- Added explicit include_paths argument to CudaProgram/NVRTC compilation; test supplies /usr/local/cuda/include without new environment reads.

### Why
- NVRTC does not automatically search toolkit header directories.

### What worked
- Both GPU tests printed PASS: f16/bf16 NVRTC compile and typed load/store on NVIDIA GB10.
- All 15 compiler test files passed on remote Node 26.
- All seven Python launcher tests passed after updating FakeCuda.compile signature.

### What didn't work
- Initial NVRTC error: could not open source file cuda_fp16.h (no directories in search list), for sm_121 and compute_121.
- Initial launcher unit run failed seven tests because FakeCuda.compile lacked include_paths keyword; updated test double to the new API, rerun passed.

### What I learned
- Explicit compilation configuration belongs in launcher arguments, not implicit environment assumptions.

### What was tricky to build
- Fixtures construct artifacts directly to isolate emitter/runtime support from still-missing typed graph propagation.

### What warrants a second pair of eyes
- Include path configuration and GPU test coverage must extend to full lowered programs; host packing remains FP32-oriented.

### What should be done in the future
- Propagate result dtype and observable rounding boundaries, backend capability handling and typed artifact sizes before enabling FP16/BF16 importer inputs.

### Code review instructions
- Review emitted sources, script 13, check_typed_cuda.py, launcher compile options and test double update.

### Technical details
- Independent generated-copy fixture; original graph benchmark precision support remains incomplete. No upstream code copied.

## Step 26: Preserve view dtypes and use authoritative artifact widths

Found view type inference silently discarded source dtype. Updated reshape/transpose/slice and tensor.view to preserve it, and replaced artifact's u8-versus-f32 size assumption with dtypeBytes-based four-byte alignment. Kernel output typing remains incomplete; no full low-precision graph execution claim.

### Prompt Context
Original scope includes all compiler changes needed for the actual corpus.
**Assistant interpretation:** Propagate type information without changing source computation.
**Inferred user intent:** Avoid incorrect pointer/storage interpretation.

### What I did
- Updated std/tensor.js view inference and std/export.js buffer byte allocation.
- Added view-dtypes.mjs covering f32/f16/bf16/u8/i64 and four view forms.

### Why
- Views must retain storage element type; byte counts must derive from explicit type widths.

### What worked
- Local Node v26.13.0 view test passed.

### What didn't work
- No new failures; broader export regression and lowered kernel output typing still pending.

### What I learned
- Frontend view dtype loss occurs before backend codegen, so emitter support alone cannot fix it.

### What was tricky to build
- Preserve existing four-byte buffer alignment while using two-byte low-precision and eight-byte integer logical storage widths.

### What warrants a second pair of eyes
- Shape-changing view semantics and storage aliasing remain distinct from dtype preservation. No broader layout support is claimed.

### What should be done in the future
- Run export/compiler regressions; propagate typed kernel outputs and explicit rounding boundaries.

### Code review instructions
- Review view-dtypes.mjs, std/tensor.js and std/export.js. Test currently proves graph type preservation, not CUDA execution for these views.

### Technical details
- Independent edits to existing Kiln implementation; no upstream source copied.

## Step 27: Execute typed artifacts through reusable PyTorch bridge

Extended TorchProgram to use artifact storage dtypes for input validation and output allocation, with explicit NVRTC include paths. Both typed CUDA fixtures now execute through the bridge rather than bypassing it with manually allocated output pointers.

### Prompt Context
Original full implementation objective; dtype architecture from Step 21.
**Assistant interpretation:** Connect verified emitter/runtime storage with reusable PyTorch execution.
**Inferred user intent:** Preserve tensor dtypes rather than numerically casting around missing compiler support.

### What I did
- Added f32/f16/bf16/u8 storage mapping and pre-CUDA validation for buffer dtype agreement and minimum byte size.
- Updated check_typed_cuda.py to call TorchProgram and assert output dtype.
- Added CPU tests proving invalid storage is rejected before launcher initialization.

### Why
- Output allocation must follow compiled storage contracts; FP32-only allocation silently corrupts typed outputs.

### What worked
- GPU f16 and bf16 tests passed through TorchProgram on GB10.

### What didn't work
- No new failures. Reduced-precision FX importer remains disabled until graph precision semantics are implemented.

### What I learned
- Artifact validation can run independently of CUDA availability, enabling meaningful local failure tests.

### What was tricky to build
- Include paths must pass through bridge constructor to existing explicit launcher option.

### What warrants a second pair of eyes
- Alias outputs with shape changes, scratch concurrency, invalid dimensions and full artifact structural validation need broader checks.

### What should be done in the future
- Propagate typed graph results/rounding and validate real low-precision task variants; run full compiler/export regressions.

### Code review instructions
- Review runtime.py, check_typed_cuda.py and test_runtime_validation.py; run integration unit tests.

### Technical details
- Artifact storage support is separate from frontend dtype support; no implicit CPU conversion or upstream code copying.

## Step 28: Represent reduced-precision rounding in scalar expressions

Added explicit round_f16/round_bf16 scalar functions shared by reference evaluation and code emission. These preserve an observable precision boundary inside a fused expression rather than relying only on output storage conversion. They are not yet inserted automatically by frontend inference.

### Prompt Context
Original full implementation scope; reduced precision design from Step 21.
**Assistant interpretation:** Preserve intermediate source rounding through fusion.
**Inferred user intent:** Correct reduced-precision execution across compiler passes.

### What I did
- Added scalar function entries using independently validated reference codecs, CUDA RN conversions and WGSL forms.
- CUDA emitter includes conversion headers when expressions need them even with FP32 storage.
- Added WGSL BF16 helper with explicit NaN handling and integer ties-to-even rounding.
- Added tests for midpoint rounding, loop reference execution and required emitter declarations.

### Why
- Fusing two source operations must not erase a required intermediate reduced-precision rounding step.

### What worked
- Node v26.13.0 focused rounding-expressions test passed.

### What didn't work
- First fixture called nonexistent E.input, raising TypeError; corrected to actual E.load API and reran successfully.

### What I learned
- Shared function table supplies reference implementations to compiled loop evaluator, so explicit rounding can survive as an ordinary scalar expression.

### What was tricky to build
- Emission header/helper requirements arise from expression functions as well as storage types.

### What warrants a second pair of eyes
- WGSL pack/unpack numerical behavior and generated shader compilation remain unverified; CUDA expression conversions need actual GPU tests beyond storage tests.

### What should be done in the future
- Run broad regressions, validate emitted rounding expressions on GPU, propagate source result dtype and insert explicit boundaries during frontend lowering.

### Code review instructions
- Inspect std/fns.js, std/emit.js and test/rounding-expressions.mjs; run focused test with Node 26.

### Technical details
- Independent implementation, no upstream source copied. Low-precision frontend remains disabled pending full propagation.

## Step 29: Validate scalar rounding on GPU and reject unsupported WGSL storage

Before connecting output dtype propagation, verified explicit rounding expressions against PyTorch CUDA and found another silent storage interpretation risk in WGSL emission. Unsupported WGSL storage now fails explicitly instead of becoming f32. Full typed lowering remains unfinished.

### Prompt Context
Original full implementation objective and typed storage design.
**Assistant interpretation:** Validate prerequisite backend precision behavior before enabling graph support.
**Inferred user intent:** Avoid numerically plausible but incorrectly typed implementations.

### What I did
- Extended script 13 with explicit-round FP32-storage kernels; added check_rounding_cuda.py.
- Added WGSL storage capability checks and tests for FP16/BF16 rejection.

### Why
- Typed CUDA support must not silently enable invalid WGSL output; scalar rounding must work beyond reference interpretation.

### What worked
- CUDA scalar f16 and bf16 rounding exactly matched PyTorch on random and midpoint inputs.
- Focused storage and rounding tests passed under local Node 26.

### What didn't work
- No new execution failures. Result dtype propagation is not yet implemented.

### What I learned
- Existing unconditional dual-source emission will require explicit backend availability handling before CUDA-only storage can pass full compilation.

### What was tricky to build
- Test FP32 storage with reduced-precision arithmetic boundary to distinguish rounding from typed pointer load/store behavior.

### What warrants a second pair of eyes
- WGSL shader compilation is still unverified; current rejection is deliberate capability reporting, not reduced-precision support.

### What should be done in the future
- Implement backend availability and typed output propagation, preserving precision identities and full numerical validation.

### Code review instructions
- Review std/emit.js capability checks, script 13 and check_rounding_cuda.py.

### Technical details
- Standalone emitted kernels, 32 test values, fixed seed 42 and midpoint cases; not full-domain GPU verification or graph execution support.

## Step 30: Propagate explicit lowered result dtype

Introduced outDtype through loop/tile/kernel/GPU representations, materialized CUDA output parameters and program export. Existing FP32 paths retain their default and identity format; non-FP32 output identities are distinguished in lower GPU stages. Frontend arithmetic promotion is still unchanged and reduced-precision importer remains disabled.

### Prompt Context
Original full compiler implementation objective and precision design.
**Assistant interpretation:** Carry storage result semantics through lowering rather than infer them from input pointers.
**Inferred user intent:** Correct typed outputs across the compiler boundary.

### What I did
- Added outDtype attributes/inference, propagated from primitive lowering through scheduling/materialization/emission.
- Updated program byte estimates, non-FP32 output identity suffix and export output allocation dtype.
- Added lowered-dtypes.mjs to validate FP32/FP16/BF16 typed view primitive lowering.

### Why
- Kernel output dtype cannot be assumed FP32 after typed graph inference.

### What worked
- Lowered view dtype test passed under local Node 26; program.js syntax check passed.

### What didn't work
- No new focused failures. Broad compiler/export tests and full low-precision graph compilation remain pending; WGSL unsupported-type diagnostic currently prevents complete dual-emission of typed kernels.

### What I learned
- Output precision must enter measurement identity as well as pointer types and byte counts.

### What was tricky to build
- Preserve unchanged FP32 identity formatting while separating newly represented output dtypes.

### What warrants a second pair of eyes
- Fusion must preserve producer rounding before inlining; output type propagation alone does not establish that invariant.

### What should be done in the future
- Run regressions, implement backend availability, preserve rounding through fusion and add typed frontend arithmetic inference.

### Code review instructions
- Review std/loop.js, tile.js, kernel.js, program.js, export.js and lowered-dtypes.mjs.

### Technical details
- No upstream code copied; this checkpoint is metadata propagation, not full FP16/BF16 benchmark support.

## Step 31: Report backend availability and diagnose u8 promotion regression

Added explicit WebGPU availability metadata so unsupported storage does not prevent CUDA source emission. WebGPU launcher rejects artifacts lacking available WGSL before importing wgpu. Full compiler regression exposed an existing implicit promotion dependency after dtype-preserving views; fixed u8 elementwise result promotion to FP32 explicitly.

### Prompt Context
Original full compiler objective; preserve existing verified behavior while adding precision semantics.
**Assistant interpretation:** Separate backend availability and storage/arithmetic contracts.
**Inferred user intent:** Correct portable execution with reviewable failures.

### What I did
- Added wgslStorageUnavailable capability query; propagate null WGSL plus reason through program/export.
- Declared missing outDtype defaults in kernel/GPU dialect attributes.
- Ran 18-file compiler regression remotely and seven launcher tests locally.

### Why
- CUDA-only storage must not masquerade as valid WGSL. View dtype preservation must not change existing u8 arithmetic output semantics.

### What worked
- Focused CUDA/lowered dtype tests and seven launcher tests passed.

### What didn't work
- First broad run: u8.mjs failed traffic count (12288) and packed WGSL checks; other 17 test files passed.
- Root cause: tensor.ew inherited u8 type after view dtype correction; explicit u8-to-f32 promotion added, full rerun started.

### What I learned
- Storage preservation and arithmetic promotion are separate rules; relying on view dtype loss concealed the distinction.

### What was tricky to build
- Capability reasons must remain separate from kernel identity and avoid generating or launching invalid sources.

### What warrants a second pair of eyes
- JS WebGPU consumer rejection and broader promotion semantics remain to be audited; current frontend low-precision support remains gated.

### What should be done in the future
- Confirm regression rerun and compile/execute a typed view through the full pipeline.

### Code review instructions
- Review std/emit.js, program.js, export.js, tensor.js and Python WebGPU initialization.

### Technical details
- No source validation/dispatch changes in this checkpoint; no full typed arithmetic claim.

## Step 32: Verify full-pipeline FP16/BF16 view execution

Compiled typed transpose frontend programs through the complete Kiln pipeline and export CLI, then executed artifacts through TorchProgram on GB10. Both output dtypes, byte sizes, shapes and values matched expectations. This establishes typed view execution, not general low-precision arithmetic.

### Prompt Context
Original implementation goal and reduced-precision contract from Step 21.
**Assistant interpretation:** Prove metadata and storage agreement across the actual compiler, not standalone emitter fixtures.
**Inferred user intent:** Expand verified compiler capabilities toward corpus support.

### What I did
- Saved scripts/14-generate-typed-views.py and typed transpose frontend sources.
- Compiled both types on remote supported Node with target a100 scheduling proxy.
- Added check_typed_views_cuda.py and archived actual compiler artifacts.

### Why
- Complete compilation tests detect dtype loss between frontend, loop, tile, kernel, program and artifact boundaries.

### What worked
- Both exports passed existing end-to-end reference checks at loop level.
- GPU tests passed for f16/bf16: output [3,2], correct dtype, 12-byte output buffer, exact values versus PyTorch transpose.

### What didn't work
- No failures in this experiment; typed arithmetic, fusion rounding and full-task precision coverage remain incomplete.

### What I learned
- Explicit outDtype and backend unavailability metadata now enable CUDA-only typed view compilation without pretending WGSL storage support.

### What was tricky to build
- Test output allocation and bytes in addition to values; correct FP32 values alone would miss dtype regressions.

### What warrants a second pair of eyes
- Odd element counts, alias-only outputs, multiple streams and arithmetic promotion need broader coverage.

### What should be done in the future
- Implement typed arithmetic inference/reference semantics and precision-preserving fusion, then genuine low-precision PassBench graph execution.

### Code review instructions
- Reproduce script 14, export via scripts/kiln-export.mjs, run check_typed_views_cuda.py; inspect sources/typed-transpose artifacts.

### Technical details
- Shapes [2,3] → [3,2], independent test data; no upstream source copied and no general low-precision benchmark support claimed.

## Step 33: Verify typed arithmetic through fusion and GPU execution

Added elementwise dtype inference/reference rounding and explicit low-precision rounding expressions during primitive lowering. Compiled add/multiply chains to one fused kernel for each low-precision dtype; both matched PyTorch exactly on GB10. Saved the user-requested full-goal roadmap in reference/03-project-roadmap.md.

### Prompt Context
User requests phase/task visibility and continued implementation across complete goal.
**Assistant interpretation:** Establish actual low-precision arithmetic, keeping full corpus support explicit.
**Inferred user intent:** See measurable compiler progress and remaining scope.

### What I did
- Added same-low-dtype elementwise inference, treating lifted scalar literals as weak scalar operands; mixed recognized floating types promote to FP32.
- Rounded reference outputs and inserted round_f16/round_bf16 in loop expressions so fusion retains boundaries.
- Saved script 15 and check_typed_arithmetic_cuda.py with compiled artifact evidence.

### Why
- Merely typing final storage would erase intermediate rounding and change source arithmetic.

### What worked
- Local typed arithmetic reference test passed.
- Both full exports passed loop-level checks and compiled to one kernel.
- CUDA FP16/BF16 add/multiply outputs matched PyTorch exactly on seeded random inputs, with preserved output dtype.

### What didn't work
- No failures in these tests. Broader promotion rules, reductions, non-floating semantics and importer precision support remain incomplete.

### What I learned
- Weak scalar identification must survive broadcast views, while tensor-valued FP32 operands remain strong dtype inputs.

### What was tricky to build
- Rounding must be expressed in the producer expression before fusion, rather than only in emitted stores.

### What warrants a second pair of eyes
- Reference input generation still does not automatically quantize arbitrary example inputs; typed task constraints and mixed-dtype semantics need explicit tests.

### What should be done in the future
- Run full regressions and cancellation-sensitive fusion tests, enable importer typed elementwise graphs, then implement genuine task normalization precision.

### Code review instructions
- Review tensor.js, loop.js, typed-arithmetic.mjs, script 15 and GPU check with archived artifacts.

### Technical details
- 32-element same-dtype add/multiply with scalar 0.5; exact CUDA comparison is bounded to this test. No full benchmark coverage claim.

## Step 34: Enable floating elementwise import and verify cancellation rounding

Enabled FP16/BF16 input type emission for the supported elementwise importer path. Low-precision batch_norm remains rejected because source accumulation semantics are not implemented. Strengthened GPU arithmetic testing with cancellation after an intermediate midpoint addition.

### Prompt Context
Original goal requires faithful importer/compiler support across real dtype variants.
**Assistant interpretation:** Enable only validated semantic paths while extending required coverage.
**Inferred user intent:** Preserve source rounding and explicit unsupported diagnostics.

### What I did
- Added torch dtype to Kiln storage mapping and input_dtypes manifest in fx_import.py.
- Added low-precision importer tests and retained integer/noncontiguous rejection tests.
- Extended script 15 and GPU test with cancellation output (x+y)-x, midpoint operands and exact PyTorch comparison.

### Why
- Cancellation detects erased intermediate rounding that output-only conversion tests can miss.

### What worked
- Eight integration unit tests passed.
- Both full exports passed loop reference checks; both GPU types passed exact outputs and zero midpoint cancellation.

### What didn't work
- No new failures. Low-precision batch_norm remains explicitly unsupported, not silently lowered using separately rounded elementary operations.

### What I learned
- Same-dtype elementwise support is a smaller validated semantic unit than normalization, whose accumulation requires a distinct lowering.

### What was tricky to build
- Keep output metadata dtype checks aligned with newly accepted input dtypes without permitting unsupported integer arithmetic.

### What warrants a second pair of eyes
- Complete mixed-dtype promotion, scalar attributes, NaN semantics and importer numerical metadata consistency require further validation.

### What should be done in the future
- Implement normalization accumulation, evaluate all first-task variants, run regressions and expand operator/layout coverage.

### Code review instructions
- Review fx_import.py/test_fx_import.py, script 15 and check_typed_arithmetic_cuda.py with archived artifacts.

### Technical details
- GPU check includes 32-element random inputs and explicit midpoint cancellation; not complete floating-domain proof or full corpus support.

## Step 35: Add explicit floating cast primitive

Implemented N.cast for FP32/FP16/BF16 and decomposition into typed scalar copy/rounding expressions. This allows future normalization lowering to use FP32 internals and a typed result without relying on weak scalar promotion. Candidate importer normalization changes are in progress and need GPU verification.

### Prompt Context
Original full compiler support and source semantics requirements.
**Assistant interpretation:** Represent accumulation precision explicitly.
**Inferred user intent:** Correct normalization across benchmark dtype variants.

### What I did
- Added nn.cast inference/reference semantics, N.cast API and decomposition into tensor.ew with explicit dtype override.
- Added tests for midpoint narrowing then widening and unsupported cast rejection.
- Began importer candidate normalization using explicit FP32 casts; no real-task GPU success claimed yet.

### Why
- Arithmetic promotion alone cannot express a deliberate accumulation/result precision boundary.

### What worked
- Local Node 26 cast test passed. Eight integration tests passed after candidate importer edits.

### What didn't work
- No new failures; candidate normalization remains unverified on GPU and broad compiler regressions pending.

### What I learned
- Explicit dtype override on scalar copy/rounding is needed to represent casts independently from operand inference.

### What was tricky to build
- Narrowing must preserve rounding during fusion; widening must retain already-rounded input values without inventing a new rounding operation.

### What warrants a second pair of eyes
- CPU reference Tensor inputs are FP32 arrays; tests must supply valid quantized low-precision values where required. Fusion of copy casts needs end-to-end tests.

### What should be done in the future
- Compile candidate batch_norm variants, compare genuine task dtype checks, and run full regressions before claiming support.

### Code review instructions
- Review tensor.js cast definition/decomposition and casts.mjs. Candidate importer remains work in progress.

### Technical details
- Independent implementation, no upstream code copied; no full normalization reproduction claim.

## Step 36: Generate candidate low-precision normalization and preserve launch failure

Saved a reproducible source-derived normalization export script and CUDA comparison driver. Both FP16/BF16 source programs were generated, and nine integration unit tests passed. Remote compilation is still being observed; no numerical normalization result is claimed.

### Prompt Context
Original goal: complete genuine task variants with documented provenance and scripts.
**Assistant interpretation:** Validate explicit FP32 accumulation lowering for low-precision normalization.
**Inferred user intent:** Correct full-task dtype coverage.

### What I did
- Saved script 16 loading pinned first-task GraphModule and emitting candidate FP16/BF16 programs.
- Added check_batchnorm_precision_cuda.py with nontrivial statistics/affine inputs and dtype-specific tolerances.
- Added importer tests checking FP32 internal casts and typed output casts.

### Why
- Separately rounded low-precision elementary operations do not match normalization accumulation semantics.

### What worked
- Both source files generated; nine integration CPU tests passed.

### What didn't work
- GPU comparison was started before dependent remote compilation completed: FileNotFoundError /work/batchnorm-f16.json. This is orchestration failure, not numerical evidence. Must wait for artifact-producing command completion before rerun.

### What I learned
- Observation yielding does not mean a dependency finished; dependent execution must remain sequential.

### What was tricky to build
- Actual low-precision source dtype metadata must coexist with FP32 internal arithmetic and runtime statistics.

### What warrants a second pair of eyes
- Candidate normalization code remains unverified on GPU and should not be described as supported yet.

### What should be done in the future
- Poll existing compilation handle, then rerun comparison only after exports succeed; inspect numerical failures if any.

### Code review instructions
- Inspect script 16, candidate fx_import.py and check_batchnorm_precision_cuda.py. Reproduce in dependency order.

### Technical details
- Generated from pinned FP32 first-task operation structure with FP16/BF16 example metadata; not yet the complete six-variant benchmark run.

## Step 37: Validate low-precision imported normalization on GPU

Existing export process completed successfully for both candidates; only then reran CUDA comparison. Imported FP16/BF16 normalization with FP32 internal arithmetic passed dtype-specific PyTorch tolerances on nontrivial statistics/affine inputs. Full six-variant evaluator acceptance is still pending.

### Prompt Context
Original genuine-task coverage requirement; prior launch failure in Step 36.
**Assistant interpretation:** Confirm dependency completion before numerical verification.
**Inferred user intent:** Correct full-task dtype support with evidence.

### What I did
- Polled original export handle: exit 0, both loop checks passed, two kernels each.
- Ran check_batchnorm_precision_cuda.py, archived both exports and result log.
- Inspected all six first-task weight metadata files: every activation is [1000,128], channel vectors [128], with four FP16, one FP32 and one BF16 variants.

### Why
- Dtype dispatch is valid only after verifying complete variant shapes/metadata, not assuming batch labels imply shapes.

### What worked
- FP16 max_abs_error 0.001953125 within rtol 1e-3/atol 1e-5.
- BF16 max_abs_error 0.0 within rtol 1.6e-2/atol 1e-5.
- Original baseline reached 37 completed tasks at observation.

### What didn't work
- No failures in the correctly sequenced rerun. Prior missing-artifact launch remains recorded in Step 36.

### What I learned
- Variant batch labels do not change this graph's activation shape; all first-task variants can use one artifact per dtype.

### What was tricky to build
- Explicit FP32 casts must encompass statistics, affine parameters and activation, with narrowing only at output.

### What warrants a second pair of eyes
- Numerical tests on random parameters are not original evaluator acceptance; original constraints, matching and score path remain required.

### What should be done in the future
- Generate dtype-dispatching pass, run all six variants under declared modified protocol, then score and document full task results.

### Code review instructions
- Review candidate importer cast lowering and sources/batchnorm-precision-check.log with archived artifact dtypes.

### Technical details
- Source-derived graph shape and exact dtype output verified on GB10. No source code copied; full task support not yet claimed.

## Step 38: Launch complete first-task dtype dispatch evaluation

Saved dtype-dispatch pass generation and six-variant evaluation procedures. First batch attempt revealed process-local protocol setup was lost in evaluator child processes. Corrected driver explicitly invokes harness once per graph; confirmed first attempt terminal before relaunch.

### Prompt Context
Original all-variant correctness/scoring requirement and intermediate script preservation.
**Assistant interpretation:** Evaluate complete first task with all required dtype artifacts.
**Inferred user intent:** Advance from isolated graph tests to task coverage.

### What I did
- Added scripts/17-write-task-pass.py and 18-run-first-task.sh.
- Generated stable module-level callable dispatching by input dtype, retaining runtime shape/type validation.
- Corrected batch subprocess handling and launched tmux passnet-first-task-v2.

### Why
- Each graph must execute matching normalization and metadata policy, not only its batch parent.

### What worked
- First driver completed; corrected driver now launches one explicit protocol process per graph.

### What didn't work
- Initial --allow-list invocation spawned original test_compiler children without harness setup; original pattern mismatch reappeared. Exact log retained remotely as first-task-all-variants.log; no original evaluator modifications made.

### What I learned
- Process-local integration modifications do not propagate to subprocess module entrypoints.

### What was tricky to build
- Complete task iteration must retain identical protocol identity in every child, with each graph separately initialized.

### What warrants a second pair of eyes
- Corrected run results and score still pending; performance remains exploratory and non-isolated.

### What should be done in the future
- Inspect corrected run per-graph numerical/dtype results, archive logs and official full-task score.

### Code review instructions
- Review scripts 17/18 and process-local setup in evaluate_normalized.py.

### Technical details
- Six variants, four FP16/one FP32/one BF16; fixed compatible [1000,128] activation and [128] channel vectors.

## Step 39: Inspect complete-task failure and isolate rerun

Corrected full-task run matched every graph; five passed and BF16 failed evaluator timing-stability checking with Environment fluctuation detected. Preserved the failure instead of claiming complete task correctness. Identified our own reference container by exact command and launched isolated rerun with automatic unpause on exit.

### Prompt Context
Original controlled measurement and full-task evidence requirements.
**Assistant interpretation:** Preserve stability failures and remove known workload interference.
**Inferred user intent:** Trustworthy all-variant validation.

### What I did
- Archived sources/first-task-v2.log; added original scoring driver script 19.
- Identified container 2481540b02eb as the exact reference-full runner via docker inspect.
- Saved script 20, which checks command identity, pauses only that container, runs six variants and resumes in EXIT trap.
- Launched tmux passnet-first-isolated.

### Why
- Existing overlapping exploratory runs cannot establish stable final timing results.

### What worked
- Six matches observed, five success statuses. Baseline reached 39 tasks before isolated rerun.

### What didn't work
- BF16 variant: RuntimeError Environment fluctuation detected; evaluator status failed. No complete-task success/score claim.

### What I learned
- Numerical smoke success does not override evaluator stability rejection.

### What was tricky to build
- Pause ownership checked against exact container command and automatic resume protects ongoing baseline work. The paused baseline task may have interrupted timing; baseline remains exploratory and requires isolated rerun.

### What warrants a second pair of eyes
- Pausing known workloads does not prove exclusive GPU access; nvidia-smi state is logged. Desktop GPU processes can remain.

### What should be done in the future
- Observe isolated run, verify automatic baseline resume, score only after complete results and preserve all attempts.

### Code review instructions
- Inspect scripts 19/20 and archived first-task-v2.log.

### Technical details
- Original evaluator stability checks retained unchanged under declared normalized/metadata integration protocol.

## Step 40: Complete first six-variant task with official scoring

The isolated run completed all six first-task variants successfully under the declared normalized/stream-metadata integration protocol. Original scorer parsed six samples and produced aggregate 0.8495327431059172. This is one supported task on DGX Spark, not unchanged-protocol reproduction or full corpus success.

### Prompt Context
Original full-task evaluation, controlled evidence and milestone documentation requirements.
**Assistant interpretation:** Verify every variant and retain complete denominator accounting.
**Inferred user intent:** See concrete progress toward all 200 tasks.

### What I did
- Verified six replacements, six success statuses and no failed statuses in first-task-isolated.log.
- Confirmed exploratory reference container resumed: paused=false, running=true.
- Ran original scorer with p=0/fpdb=0.1, archived complete log and score.
- Added script 21 and kiln-coverage.json accounting for all 200 tasks/2060 graphs.

### Why
- Successful dtype smoke checks do not establish original checker acceptance across task variants; this run closes that gate for one task.

### What worked
- All six numerical/dtype/stability checks passed. Scorer parsed six samples, aggregate 0.8495327431059172; tolerance-1 ES approximately 0.850.
- Coverage explicitly records 1/200 tasks and 6/2060 graphs verified; 199 tasks remain not verified.

### What didn't work
- No failure in isolated rerun. Earlier non-isolated stability failure remains archived; no failed run discarded from history.

### What I learned
- Correctness coverage is now complete for first task, while current runtime remains slower than eager on this measurement.

### What was tricky to build
- Isolation uses a confirmed owned container and automatic resume; paused baseline task timings remain exploratory, not final baseline evidence.

### What warrants a second pair of eyes
- Result is hardware/software-port and modified matching/metadata protocol; final comparisons need repeated isolated measurement and exact image/compilation provenance.

### What should be done in the future
- Publish second milestone report/update guide, extend corpus task coverage and run reusable policy experiments without filtering unsupported cases.

### Code review instructions
- Inspect first-task-isolated.log, first-task-score.json and scripts 18–21; regenerate coverage.

### Technical details
- Four FP16, one FP32, one BF16 variants; graph shape [1000,128]. Full remaining benchmark and agents/meta-optimization remain incomplete.

## Step 41: Extend importer to next genuine task and validate regressions

Inspected the next pinned evaluation task: scalar division followed by tensor transpose. Added explicit tensor-method transpose import and exported all twelve variants from actual source/metadata. These are imported source artifacts only; task coverage remains 1/200 until GPU/evaluator acceptance.

### Prompt Context
Original complete-corpus target; preserve scripts and source provenance.
**Assistant interpretation:** Select extensions based on actual next-task dependencies.
**Inferred user intent:** Expand verified coverage rather than only synthetic capabilities.

### What I did
- Added call_method transpose lowering with integer-dimension validation and unsupported-method diagnostics.
- Added cross-dtype importer unit test for divide/transpose.
- Saved script 22 loading actual pinned model/input/weight metadata and emitted twelve project scripts plus manifest.
- Ran full remote compiler regressions after precision changes.

### Why
- Next task needs no new arithmetic primitive, but method import was missing.

### What worked
- All 20 compiler test files passed; ten integration tests passed.
- All twelve second-task variants exported successfully from source graphs.

### What didn't work
- No new failures; full second-task compile/GPU/matcher checks remain pending.

### What I learned
- Source graph support requires method targets as well as functional targets; positional dimension arguments remain explicit.

### What was tricky to build
- Preserve graph/task membership and dtype manifest for every variant; importing does not prove support.

### What warrants a second pair of eyes
- Output layout/alias contracts and matching normalization for tensor methods need original evaluator validation.

### What should be done in the future
- Compile all twelve artifacts, validate against PyTorch, generate reusable dispatching pass and run full-task checks.

### Code review instructions
- Review fx_import.py, test_fx_import.py, script 22 and sources/second-task/manifest.json.

### Technical details
- Source task c2737b2dfa6d0ea43a5e6c03a1ce62e33c08403e044afdf09977b864ccbde68d at pinned upstream revision; no code copied.

## Step 42: Preserve all-variant second-task compilation and GPU validation drivers

Added compilation and source-based GPU comparison drivers for all twelve second-task variants. Remote staging/launch tool handles remain live during observation; no completed compilation or GPU validation result is claimed yet.

### Prompt Context
Original corpus-wide implementation and reproducible script requirements.
**Assistant interpretation:** Validate all variants before incrementing verified task coverage.
**Inferred user intent:** Complete measured task support with explicit denominators.

### What I did
- Saved scripts/23-compile-second-task.py with per-variant export logs and cumulative compile receipt.
- Added check_second_task_cuda.py loading original pinned GraphModule and comparing output dtype/values for each manifest entry.
- GPU validator requires a complete successful compile receipt before executing any variant.

### Why
- Prior missing-artifact failure showed dependent execution must be explicitly gated.

### What worked
- Scripts are preserved and remote staging handles are being observed.

### What didn't work
- No new terminal failures; staging/remote observation is slow. Existing live handles have not been restarted.

### What I learned
- A cumulative receipt can prove dependency completeness without inferring success from existing filenames.

### What was tricky to build
- Load each original graph rather than duplicate its scalar/transpose formula in the validator; retain graph identity per result.

### What warrants a second pair of eyes
- Shape/output-layout and original matcher/score checks remain separate gates after GPU value checks.

### What should be done in the future
- Poll staging/compiler handles, inspect complete compile receipt, then run GPU validator and original full-task evaluator.

### Code review instructions
- Inspect script 23 and check_second_task_cuda.py alongside sources/second-task/manifest.json.

### Technical details
- All twelve variants retained; verified coverage remains 1/200. No low-coverage filtering or new performance claims.

## Step 43: Validate all twelve second-task exports and prepare constant-aware pass

All twelve compiler exports completed with exit 0, then all twelve GPU comparisons passed against original GraphModule source with dtype-specific tolerances. Original matcher/checker task acceptance is still pending, so verified benchmark coverage remains one task.

### Prompt Context
Original complete corpus coverage and reusable pass requirements.
**Assistant interpretation:** Preserve every variant and capture actual varying constants.
**Inferred user intent:** Generalize pass dispatch beyond one example.

### What I did
- Polled existing staging/compiler handles; all twelve compile entries returned 0.
- Ran receipt-gated check_second_task_cuda.py; twelve variants passed.
- Inspected emitted division constants: two variants use 2.8284271247461903; others use 1.6817928305074292.
- Added scripts 24/25 to generate constant-aware pattern/dispatch and run original checker per graph.
- Started archiving artifacts and receipts through existing transfer handle.

### Why
- Hardcoding the first constant would implement the wrong computation for two variants.

### What worked
- Twelve source-based GPU value/dtype checks passed after compilation completion.

### What didn't work
- No numerical failures; remote generation/transfer still being observed. Full evaluator outcomes pending.

### What I learned
- Task pattern can share operator structure while scalar constants vary; dispatch must include captured constant.

### What was tricky to build
- Deduplicate artifacts by shape/dtype/constant without excluding any variant or substituting model-name lookup.

### What warrants a second pair of eyes
- Original SubgraphMatcher scalar placeholder handling, output layout and integrity acceptance remain unverified.

### What should be done in the future
- Observe transfer completion, launch per-graph evaluator, isolate stable scoring, update coverage only after checker acceptance.

### Code review instructions
- Inspect scripts 23–25, manifest, GPU receipt and original model.py constants.

### Technical details
- No performance claim; GPU comparison success is a separate gate from complete PassBench task support.

## Step 44: Audit and score complete second task

Archived complete isolated second-task evaluator log and audited exact expected graph membership, one replacement and one successful status per graph. All twelve variants passed under declared integration protocol. Official scorer parsed twelve samples and reported aggregate 0.8227679072232458. Full-goal work remains incomplete.

### Prompt Context
Original full corpus accounting and integrity requirements.
**Assistant interpretation:** Prove graph membership, not merely count success messages.
**Inferred user intent:** Trustworthy coverage progression.

### What I did
- Added script 27 scoring the unchanged isolated log with p=0/fpdb=0.1.
- Improved script 21 to parse Processing blocks, reject unexpected/duplicate graphs and compute coverage only from exact per-graph outcomes.
- Updated coverage ledger to 2/200 tasks and 18/2060 graphs.

### Why
- Counts alone could validate duplicated or unrelated graph runs.

### What worked
- Twelve expected second-task graphs each matched once and succeeded. Official aggregate 0.8227679072232458.
- All original task denominators remain visible; 198 tasks are not verified.

### What didn't work
- Vault milestone publication remains awaiting explicit destination approval after automatic review rejected it twice; no workaround attempted. Benchmark work continued independently.

### What I learned
- Coverage identity checks should be part of evidence generation, not manually inferred from a task name.

### What was tricky to build
- Incomplete log transfers must not promote task status; ledger requires complete expected membership and successful statuses.

### What warrants a second pair of eyes
- Scores remain hardware/software-port, modified protocol results; neither task is faster than eager in current aggregate measurements.

### What should be done in the future
- Publish pending report after approval, extend compiler operation coverage and conduct agent/meta-optimization experiments.

### Code review instructions
- Inspect scripts 21/27, second-task-isolated.log, second-task-score.json and kiln-coverage.json.

### Technical details
- No original evaluator/scorer file edits; matching/stream metadata policy remains explicitly declared. Remaining 198 tasks and final controlled comparisons are incomplete.

## Step 45: Implement convolution shape and reference foundation

Started the next major missing primitive required by the third task. Added independent grouped NCHW cross-correlation reference and validated deterministic cases against PyTorch CPU. No convolution lowering or benchmark support is claimed yet.

### Prompt Context
User authorizes missing Kiln implementation and detailed source provenance.
**Assistant interpretation:** Build concrete operator dependencies with independent reference evidence.
**Inferred user intent:** Progress toward complete corpus support.

### What I did
- Added std/conv2d.js shape/group validation and reference evaluation.
- Added script 28 generating PyTorch oracle fixtures; tested grouped/depthwise, stride, padding, dilation, bias and invalid cases.
- Added design-doc/03-convolution-lowering.md with indexing and safe-load requirements.

### Why
- Third task requires convolution plus interpolation; emitter kernels must have a trustworthy semantic reference first.

### What worked
- Local Node 26 conv2d test passed against all three PyTorch CPU cases at FP32 baseline tolerance.

### What didn't work
- No test failures; lowering, scheduling, GPU execution and benchmark integration remain absent.

### What I learned
- Boundary padding requires conditional safe loads or explicit padded tensors; a select after an unsafe load is insufficient.

### What was tricky to build
- Separate per-group input-channel index from output-channel grouping and spatial dilation.

### What warrants a second pair of eyes
- Reference accumulation differs in order/precision from native PyTorch; fixture agreement does not establish broad numerical equivalence.

### What should be done in the future
- Implement masked-load IR or padded-tensor lowering, expose frontend convolution, test GPU and original task variants; implement remaining interpolation/mutation semantics.

### Code review instructions
- Run test/conv2d.mjs and regenerate fixture using script 28; inspect design-doc/03.

### Technical details
- Independent mathematical implementation; PyTorch is differential oracle only, version recorded in fixture. No upstream code copied.

## Step 46: Decompose FP32 convolution into existing tensor primitives

Added N.conv2d/frontend operation and correctness-first decomposition into indexed views, multiplication and reductions. Padding uses safe clamped input views and explicit spatial mask/select, preventing out-of-bounds reads. All three PyTorch fixtures now pass both reference and decomposed evaluation; GPU lowering remains pending.

### Prompt Context
Original missing compiler capabilities authorization and provenance requirements.
**Assistant interpretation:** Implement safe convolution lowering before scheduling optimization.
**Inferred user intent:** Extend real corpus support with independently checked semantics.

### What I did
- Added lowerConv2d grouping/spatial maps and nested reductions; FP32 frontend validation and optional zero bias.
- Extended conv2d.mjs to run actual decomposition and compare all outputs with PyTorch fixtures.
- Fixed primitive helper toV to recognize Tensor-valued constants used by the padding mask.

### Why
- Selecting zero after an invalid read is unsafe; clamped reads guarantee validity even when selection evaluates both operands.

### What worked
- Node 26 reference and decomposed grouped/strided/dilated fixture comparisons passed.

### What didn't work
- First decomposition test: tensor.const EvalError f is not a function. Cause: Tensor mask was treated as scalar splat value. Explicit Tensor-data constant handling in toV fixed it; rerun passed.

### What I learned
- Primitive helper accepted Value/scalar but not Tensor data, unlike frontend lifting. Actual decomposition tests exposed this missing case.

### What was tricky to build
- Group-channel indexing, padded coordinate clamps and reduction-axis preservation must agree across seven-dimensional indexed views.

### What warrants a second pair of eyes
- Static spatial mask memory overhead, nested reduction scheduling and NaN padding selection require GPU validation. Reduced-precision convolution remains explicitly rejected.

### What should be done in the future
- Compile/export fixtures, run GPU comparisons, optimize padding representation, implement interpolation and mutation legality for real task.

### Code review instructions
- Inspect conv2d.js lowerConv2d, tensor.js frontend/decomposition and conv2d.mjs.

### Technical details
- Independent primitive-based implementation, no upstream source copied. Static mask is a visible constant operand; no hidden host execution or benchmark fallback.

## Step 47: Execute full compiler convolution fixtures on GB10

All three convolution fixture programs compiled through the full pipeline with existing loop reference checks enabled, then passed PyTorch GPU comparisons. Standard, grouped/strided and depthwise/dilated cases are covered. This does not yet complete a new benchmark task.

### Prompt Context
Original complete implementation/measurement scope and reproducible procedures.
**Assistant interpretation:** Validate safe padding and reductions on actual GPU before real-task expansion.
**Inferred user intent:** Extend verified compiler primitives rather than only reference code.

### What I did
- Saved script 29 generating full convolution project sources.
- Added check_convolution_cuda.py requiring all three artifacts before execution.
- Compiled three artifacts, ran GPU comparisons and all compiler tests, then started archive transfer.

### Why
- Reference decomposition cannot establish scheduled kernel indexing or padding safety.

### What worked
- All exports passed loop-level end-to-end checks.
- GPU max_abs_error: 9.5367431640625e-07, 9.5367431640625e-07, 4.76837158203125e-07.
- All 21 compiler test files passed.

### What didn't work
- No failures in this experiment; real-task operator chain and low-precision convolution remain incomplete.

### What I learned
- Existing row scheduling can execute nested convolution reductions for these correctness fixtures; profitability has not been established.

### What was tricky to build
- Padded variants materialize an additional kernel/constant mask; standard case compiles into one reduction kernel.

### What warrants a second pair of eyes
- Large real convolution shapes may cause expensive intermediate work; mask representation and schedules need measured optimization.

### What should be done in the future
- Add interpolation, legal in-place ReLU handling and low-precision convolution; import actual third-task chain and validate all variants.

### Code review instructions
- Inspect script 29, check_convolution_cuda.py and sources/convolution artifacts plus GPU/regression logs.

### Technical details
- Tested small FP32 fixtures only; no claimed task coverage beyond 2/200, no speedup claim and no upstream source copied.

## Step 48: Implement FP32 bilinear resize reference and decomposition

Added the second major third-task dependency: NCHW bilinear interpolation with explicit output size and align_corners=False semantics. Reference and tensor-primitive decomposition agree with PyTorch fixtures; no GPU result claimed yet.

### Prompt Context
Original all-missing-pieces implementation and provenance requirements.
**Assistant interpretation:** Implement actual third-task interpolation dependency with tested coordinate semantics.
**Inferred user intent:** Extend full operator chain support.

### What I did
- Added std/bilinear.js coordinate/reference and indexed-view decomposition.
- Added N.resizeBilinear/frontend operation with FP32 validation.
- Saved script 30 generating deterministic PyTorch fixtures; tested up/down/identity/singleton cases through reference and decomposition.

### Why
- Half-pixel coordinate convention and clamped neighbors must match source interpolation behavior.

### What worked
- Local Node 26 bilinear test passed all four fixtures at FP32 baseline tolerance.

### What didn't work
- No failures; GPU execution, larger numerical cases and reduced precision remain pending.

### What I learned
- Integer source base indices can use rational index arithmetic while fractional coefficients remain explicit constant tensors.

### What was tricky to build
- Clamp half-pixel coordinates at zero before computing neighbors; singleton dimensions must never produce out-of-bounds reads.

### What warrants a second pair of eyes
- PyTorch scale arithmetic rounding differs from JavaScript double calculations at large sizes; current fixtures are small. Constant coefficient storage affects memory/performance.

### What should be done in the future
- Compile/execute fixtures on CUDA, extend importer, prove mutation legality for in-place ReLU and evaluate third task variants.

### Code review instructions
- Review bilinear.js, tensor.js, bilinear.mjs and script 30.

### Technical details
- Independent implementation; PyTorch used only as fixture oracle. Supports explicit size, FP32 NCHW, align_corners=False only. No upstream code copied.

## Step 49: Verify bilinear full pipeline on CUDA

Compiled all four interpolation fixtures through Kiln and ran actual PyTorch CUDA comparisons. All passed at FP32 baseline tolerance, including upsampling, downsampling, singleton input and identity resize. No real-task coverage increment yet.

### Prompt Context
Original full implementation/measurement and preserved scripts requirement.
**Assistant interpretation:** Validate emitter/indexing rather than reference code alone.
**Inferred user intent:** Correct full operator chain support.

### What I did
- Saved script 31 and generated full project sources.
- Added check_bilinear_cuda.py with complete-artifact precondition.
- Ran full compiler export, GPU validation and 22-file regression suite.

### Why
- GPU source coordinate calculation and constant coefficient layout can diverge from reference decomposition.

### What worked
- All exports passed loop reference checks.
- GPU max_abs_error: 1.7881393432617188e-07, 2.682209014892578e-07, 0, 0.
- All 22 compiler test files passed.

### What didn't work
- No failures; real-task import, mutation legality and low precision remain pending.

### What I learned
- Existing view fusion emits single kernels for these explicit-size bilinear fixtures.

### What was tricky to build
- Wait for all four dependent exports before running validator; precondition prevents missing-artifact false failures.

### What warrants a second pair of eyes
- Larger-coordinate numerical behavior and coefficient constant memory overhead require broader tests/profiling.

### What should be done in the future
- Import conv2d/resize chain and prove legal conversion of fresh single-use in-place ReLU; validate actual task graphs.

### Code review instructions
- Review script 31, check_bilinear_cuda.py and archived bilinear artifacts/logs.

### Technical details
- Small FP32 fixtures, explicit output size and align_corners=False only; no upstream implementation copied.

## Step 50: Import convolution/residual/resize chain with mutation legality

Added explicit FP32 convolution and bilinear interpolation import plus a narrow legality check for in-place ReLU. The in-place result is functionalized only when its operand is a fresh torch.conv2d result referenced exactly once by the graph; mutations of inputs or other producers remain rejected.

### Prompt Context
Original full compiler/importer support and no silent semantic changes requirement.
**Assistant interpretation:** Preserve alias/mutation behavior while enabling the actual third-task pattern.
**Inferred user intent:** Correct graph translation across complete operator chains.

### What I did
- Added argument binding/defaults for torch.conv2d and explicit-size bilinear align_corners=False interpolation.
- Counted source references and checked fresh single-use convolution output before discarding in-place ReLU mutation.
- Added positive chain test and negative input-mutation test.

### Why
- Functionalizing arbitrary in-place operations can silently change aliased inputs and observable outputs.

### What worked
- Twelve integration CPU tests passed, including full synthetic chain import and rejected input mutation.

### What didn't work
- No new failures; real third-task shapes and original evaluator acceptance remain unverified.

### What I learned
- Exact source reference counts support a narrow proven freshness case; they are not a general alias analysis.

### What was tricky to build
- Separate positional/keyword binding and static literals from tensor references; preserve convolution options explicitly.

### What warrants a second pair of eyes
- Duplicate/missing argument validation, low precision and broader alias-producing operators remain incomplete. Current mutation allowance is intentionally restricted.

### What should be done in the future
- Export real third-task FP32 graph, compile/GPU-check it, implement low-precision variants and full-task checker path.

### Code review instructions
- Review fx_import.py and new chain/mutation tests in test_fx_import.py.

### Technical details
- Independent importer implementation; no upstream code copied and no task-coverage increment claimed.

## Step 51: Export actual FP16 third-task candidate

Inspection found the third task has only one variant and it is FP16; there is no FP32 benchmark variant to validate first. Added candidate explicit FP32 internal convolution/interpolation with narrowing at each source operation result, and exported the actual graph. GPU and original evaluator validation remain pending.

### Prompt Context
Original complete benchmark target; unsupported variants must remain visible.
**Assistant interpretation:** Implement required reduced precision rather than substitute an easier FP32 benchmark.
**Inferred user intent:** Faithful real-task support.

### What I did
- Saved script 32 using actual pinned graph/metadata; initial manifest exposed sole variant as unsupported.
- Added N.conv2d/resizeBilinear candidate widening/narrowing for FP16/BF16 and importer acceptance; mixed low-precision convolution operands are rejected.
- Regenerated actual FP16 project and saved script 33 for remote full compiler export in tmux.

### Why
- Testing a derived FP32 graph cannot establish support for the sole FP16 task variant.

### What worked
- Actual source graph exported successfully.
- Existing FP32 convolution and bilinear reference/decomposition tests still pass.
- Exploratory baseline reached 65 tasks at latest observation.

### What didn't work
- No new failure yet; candidate precision behavior and full compile remain unverified.

### What I learned
- Task dtype composition differs; corpus metadata must determine required capability rather than assuming FP32 is always present.

### What was tricky to build
- Preserve rounding after convolution, residual arithmetic and interpolation independently, rather than narrowing only the final tensor.

### What warrants a second pair of eyes
- FP32 internal arithmetic is a candidate model of source accumulation, not proven for all backends/shapes. Actual GPU comparison is required.

### What should be done in the future
- Observe existing compilation handle, validate original FP16 graph on GPU, resolve numerical failures and run isolated original checker/scorer.

### Code review instructions
- Inspect scripts 32/33, third-task manifest/source, tensor.js wrappers and importer changes.

### Technical details
- Candidate implementation only; verified coverage remains 2/200 and no GPU correctness claim for new precision path.

## Step 52: Detect actual FP16 task numerical mismatch

Existing compile completed with three kernels, but costly compiler reference evaluation was skipped (~1006M estimated operations). Source-based CUDA comparison failed; this is a real precision mismatch, not task support. Preserve unchanged evidence and diagnose stages next.

### Prompt Context
Original correctness and full-task requirements; no weakened tolerances.
**Assistant interpretation:** Test actual compiled graph against original source and keep failures visible.
**Inferred user intent:** Faithful numerical behavior before scoring.

### What I did
- Polled completed export process; saved actual third-task artifact and compile diagnostics.
- Added check_third_task_cuda.py and ran original model comparison with FP16 baseline rtol 1e-3/atol 1e-5.

### Why
- Successful compilation and small fixtures cannot establish real-shape reduced-precision correctness.

### What worked
- Actual graph exported and CUDA program executed.

### What didn't work
- 508/73728 elements mismatched (0.7%); maximum absolute difference 0.125, maximum relative difference 0.066650390625.
- Compiler check was skipped due estimated cost, not passed. Shell launch returned after printing failed Python log; log assertion is authoritative failure evidence.

### What I learned
- Need isolate convolution, bias/activation/residual rounding and resize to determine first divergence; no causal conclusion yet.

### What was tricky to build
- Third task resize is [24,24] after residual already [1,128,24,24], so identity-resize behavior is one useful diagnostic boundary.

### What warrants a second pair of eyes
- Convolution accumulation order, bias fusion and source precision semantics on actual CUDA backend.

### What should be done in the future
- Save staged-output diagnostic scripts, compare every intermediate with PyTorch and fix source semantics without loosening checker tolerances.

### Code review instructions
- Inspect third-task source/artifact, third-task-gpu.log, third-compile.log and check_third_task_cuda.py.

### Technical details
- Verified benchmark coverage remains 2/200; this numerical failure is not an external blocker and implementation work continues.

## Step 53: Preserve stage-by-stage FP16 diagnostic

Compiled an explicitly diagnostic graph exposing convolution, ReLU, residual and resize separately. Started GPU comparisons against each PyTorch intermediate and alternate FP32/bias-order hypotheses. No causal conclusion or fix is claimed before the diagnostic finishes.

### Prompt Context
Original numerical correctness and intermediate script preservation requirements.
**Assistant interpretation:** Isolate first divergence without loosening tolerances.
**Inferred user intent:** Correct source semantics rather than mask error.

### What I did
- Saved script 34 generating stage outputs and diagnose_third_task_cuda.py.
- Confirmed diagnostic export completed (five kernels); costly loop reference again skipped.
- Started stage comparisons plus FP32 accumulation and post-narrowing bias hypotheses.

### Why
- Final mismatch alone cannot identify convolution, fusion, bias or resize as cause.

### What worked
- Diagnostic export completed and GPU process is being observed.

### What didn't work
- Original failure from Step 52 remains unresolved; no new terminal diagnostic result yet.

### What I learned
- Exposing stages changes fusion/kernel boundaries, so compare this diagnostic with original fused artifact after any fix.

### What was tricky to build
- Compare later stages both cumulatively and relative to Kiln's own earlier output to separate propagated error from new local error.

### What warrants a second pair of eyes
- Bias-add precision/order is a hypothesis only; actual cuDNN/PyTorch behavior needs evidence.

### What should be done in the future
- Poll same GPU handle, archive report and artifacts, fix first established divergence and rerun original graph.

### Code review instructions
- Inspect script 34 and diagnose_third_task_cuda.py; no benchmark tolerance/config changes introduced.

### Technical details
- Separate diagnostic process disables TF32 only for its alternate FP32 oracle; benchmark configuration is unchanged. Verified coverage remains 2/200.

### Completed diagnostic outcome
- First divergence: convolution 180 failing elements; later stages have zero local error when compared against Kiln preceding outputs.
- PyTorch FP16 biased convolution exactly equals FP16 bias-free convolution followed by FP16 bias addition for this test (zero differing elements).
- Kiln versus FP32-narrow oracle has ten failing elements; biased PyTorch half versus that oracle has 185. Bias boundary is established as material, but accumulation-order residuals may remain.
- Next change must narrow convolution before bias addition, then rerun original fused graph rather than only stage diagnostic.

## Step 54: Correct low-precision convolution bias boundary

Implemented evidence-backed narrowing of bias-free convolution before bias addition, matching the observed PyTorch CUDA half path. Added a small precision-sensitive reference/decomposition regression for FP16/BF16. Original-shape corrected export remains under observation; no GPU success claim yet.

### Prompt Context
Original correctness requirement and stage diagnosis from Step 53.
**Assistant interpretation:** Fix established source-visible bias ordering without loosening numerical tolerances.
**Inferred user intent:** Correct compiler semantics rather than hide mismatch.

### What I did
- Changed low-precision N.conv2d to narrow bias-free FP32-internal result, then add typed reshaped bias.
- Added midpoint case where alternative bias ordering changes output.
- Compiling separate bias-fixed.json, preserving original failed 000.json.
- Saved script 35 sequencing export then original graph CUDA comparison; validator accepts explicit artifact filename.

### Why
- Stage diagnostic showed PyTorch biased half convolution equals narrowed bias-free convolution plus half bias exactly for actual test.

### What worked
- FP32 reference/decomposition fixtures and new FP16/BF16 bias boundary tests passed locally on Node 26.

### What didn't work
- No new completed GPU result; original mismatch remains unresolved until corrected original fused artifact is validated.

### What I learned
- Precision-sensitive bias ordering belongs in frontend lowering so fusion retains explicit narrowing.

### What was tricky to build
- Preserve no-bias behavior and original failed artifacts while adding a distinct corrected test artifact.

### What warrants a second pair of eyes
- Accumulation-order residual differences may remain even after material bias-boundary fix; BF16 backend behavior requires independent checks.

### What should be done in the future
- Poll existing compile handle, run corrected artifact comparison and inspect any remaining failures; archive exact outcomes.

### Code review instructions
- Review tensor.js low-precision conv wrapper, conv2d.mjs midpoint regression and script 35.

### Technical details
- Independent semantic correction from differential GPU evidence, no upstream source copied or checker changed.

## Step 55: Quantify remaining convolution accumulation mismatch

Corrected original fused graph still fails tolerance, reduced from 508 to 67 elements. A separately labeled higher-precision local/shared arithmetic experiment reduces this only to 62. Neither passes; no third-task coverage claim. Diagnostic source modifications are excluded from measurement identity and benchmark evidence.

### Prompt Context
Original numerical fidelity and evidence requirements.
**Assistant interpretation:** Test remaining error hypothesis without silently substituting source/identity.
**Inferred user intent:** Fix actual compiler semantics and report limitations.

### What I did
- Observed completed corrected graph comparison.
- Saved script 36 generating clearly marked diagnostic artifact with double local/shared declarations, preserving pointer types.
- Ran original comparison and archived failure logs plus stage report.

### Why
- Bias correction was material but did not explain every mismatch; higher precision experiment tests accumulation sensitivity.

### What worked
- Bias fix reduced failures substantially (508→67); diagnostic executed.

### What didn't work
- Corrected graph: 67/73728 mismatches, max_abs 0.03125, max_relative 0.011444091796875.
- Higher-precision diagnostic: 62/73728 mismatches with same maximum errors. This is not a successful fix.

### What I learned
- Simply widening local accumulators is insufficient. Intermediate storage and native convolution accumulation behavior need more precise comparison.

### What was tricky to build
- Modified diagnostic source retains stale kernel identities, so explicitly mark it excluded rather than treating it as a compiler measurement.

### What warrants a second pair of eyes
- cuDNN half reduction precision/order, remaining FP32 intermediate buffers and exact source input constraints.

### What should be done in the future
- Compare bias-free convolution with exact/high-precision oracles and investigate accumulation/storage boundaries; retain original checker tolerances.

### Code review instructions
- Inspect script 36 and failure logs; diagnostic artifact is not eligible for benchmark scoring.

### Technical details
- No checker relaxation or delegated torch convolution in Kiln execution. Reference baseline reached 73 completed tasks at observation.

## Step 56: Distinguish original benchmark replay from broader stress inputs

Inspected actual metadata and used unchanged upstream get_input_dict/replay_tensor to validate the corrected artifact. Original replay inputs pass FP16 baseline tolerances, while unit-scale random stress failure remains explicitly unresolved. Neither result substitutes for complete original evaluator acceptance.

### Prompt Context
Original benchmark fidelity requirement and preservation of all failures.
**Assistant interpretation:** Test actual input contract without hiding broader numerical limitations.
**Inferred user intent:** Scientifically accurate coverage and compiler correctness reporting.

### What I did
- Inspected source metadata: bias mean/std zero; weight std 0.042, residual mean/std 0.008/0.129, activation mean/std 0/0.023.
- Added check_third_task_replay.py invoking original upstream input replay API, fixed seed 42.
- Compared original GraphModule and corrected artifact at rtol 1e-3/atol 1e-5.

### Why
- Prior stress uses unit-scale inputs, materially different from declared replay distributions. Both are useful but answer distinct questions.

### What worked
- Replay-input GPU check passed; max_abs_error 1.52587890625e-05.

### What didn't work
- Broader stress-input test still fails 67 elements after bias fix; higher-precision diagnostic still fails 62. No claim that this robustness issue is fixed.

### What I learned
- Actual metadata must be used for faithful benchmark evaluation, with stress testing retained as a separate correctness investigation.

### What was tricky to build
- Use original replay function rather than hand-implementing distribution generation; preserve exact graph/input identity.

### What warrants a second pair of eyes
- Distribution metadata is not a proof that all larger values are semantically invalid. Compiler robustness limitations remain material.

### What should be done in the future
- Run complete original checker/scorer under declared protocol on third task; continue high-precision accumulation diagnosis independently.

### Code review instructions
- Inspect check_third_task_replay.py and replay-check.json alongside prior stress failure logs.

### Technical details
- Benchmark coverage remains 2/200 until original evaluator acceptance. No loosened tolerance or changed source input generator.

## Step 57: Preserve actual third-task matcher rejection

Generated actual-task pass and ran isolated original checker through declared protocol. Pattern failed to match before numerical validation. Baseline resumed automatically. Saved a fresh graph-inspection procedure rather than changing matcher normalization without evidence.

### Prompt Context
Original full checker/integrity/scoring requirement.
**Assistant interpretation:** Verify original evaluator acceptance beyond input-replay numerical check.
**Inferred user intent:** Faithful task coverage with distinct failure stages.

### What I did
- Saved scripts 37–39 generating pass and executing isolated task.
- Observed original matcher failure and paused=false on reference container afterward.
- Saved script 40 capturing symbolic and Dynamo third-task graph with original replay inputs; diagnostic is running.

### Why
- Replay numerical success cannot establish pattern matching or reverse-order checker acceptance.

### What worked
- Pass loaded and original source validation ran; isolation cleanup resumed baseline.

### What didn't work
- Pass KilnConvResize failed to match; RuntimeError No passes modified the graph; evaluator status failed.

### What I learned
- Current normalization policy covers earlier task targets, not necessarily interpolation's default-argument forms.

### What was tricky to build
- Keep mutation/alias legality separate from pattern representation and retain original operation constants.

### What warrants a second pair of eyes
- Interpolation default normalization is a hypothesis pending exact graph evidence; no matcher relaxation introduced.

### What should be done in the future
- Poll graph diagnostic, normalize only established equivalent call forms with tests, then rerun original checker.

### Code review instructions
- Review scripts 37–40 and unchanged normalization target whitelist.

### Technical details
- Numerical stress limitation remains unresolved; verified task coverage stays 2/200.

## Step 58: Normalize observed interpolation default-argument mismatch

Corrected graph diagnostic launch and captured exact Dynamo/symbolic graphs. Difference is omitted interpolation defaults; added interpolate to explicit functional normalization whitelist with output-preservation/matcher test. Isolated third-task checker retry is being launched/observed; no acceptance claim yet.

### Prompt Context
Original integrity and reproducible diagnostics requirements.
**Assistant interpretation:** Change only proven equivalent call representation, with tests.
**Inferred user intent:** Faithful checker integration without hidden bypasses.

### What I did
- Saved script 41 with explicit upstream Python import path.
- Captured third-pattern-v2.log; convolution/ReLU/add targets agree, interpolation defaults differ.
- Extended fx_normalize TARGETS with functional.interpolate; added match and exact-output test.
- Ran integration tests and initiated isolated v2 checker.

### Why
- Structural default-argument mismatch is the same class already declared in normalized protocol; tensor arithmetic unchanged.

### What worked
- Thirteen integration tests passed, including interpolation normalization and exact CPU output preservation.

### What didn't work
- First script 40 execution failed ModuleNotFoundError pass_bench because script path /work lacked upstream PYTHONPATH. Script 41 explicit launch fixed it.
- Original third-task checker mismatch remains archived; corrected acceptance pending.

### What I learned
- Script location affects module import path even when container working directory is upstream.

### What was tricky to build
- Normalize both pattern and target using bound defaults; retain in-place ReLU attribute unchanged.

### What warrants a second pair of eyes
- Protocol whitelist expansion must remain explicit in reports; this is not unchanged PassBench reproduction.

### What should be done in the future
- Poll retry, inspect numerical/reverse-order/stability results, score only complete outcomes and retain stress limitation.

### Code review instructions
- Inspect scripts 40/41, third-pattern-v2.log, fx_normalize.py and test_fx_normalize.py.

### Technical details
- Source validator and dispatch arithmetic guard unchanged; coverage stays 2/200 until full checker result.

## Step 59: Accept and score actual third task with explicit numerical limitation

Original checker accepted the actual FP16 convolution/residual/resize graph after interpolation normalization, using unchanged original replay inputs and numerical/dtype/stability checks. Official aggregate is 0.043470409529710305, indicating severe slowdown. Broader random-stress mismatch remains unresolved and recorded in coverage ledger.

### Prompt Context
Original benchmark reproduction, complete accounting and truthful measurement requirements.
**Assistant interpretation:** Separate benchmark acceptance from general numerical robustness and performance quality.
**Inferred user intent:** Complete measured integration with material limitations visible.

### What I did
- Verified one replacement, success status and automatic baseline resume.
- Added script 42, ran unchanged official scorer with p=0/fpdb=0.1, archived checker log and score transfer.
- Updated graph-identity coverage ledger and explicit third-task stress limitation.

### Why
- Numerical acceptance does not imply speedup or prove correctness across arbitrary input distributions.

### What worked
- Actual benchmark graph numerical/dtype/stability checks passed under declared normalized/metadata protocol.
- Coverage now 3/200 tasks, 19/2060 graphs; every denominator retained.

### What didn't work
- Official score 0.043470409529710305 is far below eager baseline, not a performance improvement.
- Unit-scale stress numerical mismatch remains 67 elements after bias fix; no robustness completion claim.

### What I learned
- Correctness-first indexed convolution reduction is functionally useful but not competitive with native convolution on this workload.

### What was tricky to build
- Preserve the distinction between actual replay success, broader numerical limitation, modified protocol and very poor speed score.

### What warrants a second pair of eyes
- Need measured bottleneck/precision analysis before optimizing; no claim that static masks alone explain slowdown.

### What should be done in the future
- Profile convolution schedules, investigate remaining robustness mismatch, expand operator coverage, execute agent/meta-optimization experiments and update deliverables.

### Code review instructions
- Inspect third-task-isolated-v2.log, scorer output and ledger limitations; scripts 21/42 reproduce accounting.

### Technical details
- Third task has one FP16 graph; benchmark-supported coverage does not assert broad convolution robustness. Remaining 197 tasks are unverified.

## Step 60: Import static sum/mean reductions with explicit precision

Added sum/mean functional/method import for static axes, keepdim and supported floating output metadata. Lowering widens input to FP32, reduces while preserving axes, applies mean scaling, reconstructs output shape and narrows to declared result dtype. Broader reduction/promotion coverage remains incomplete.

### Prompt Context
Original full operator coverage and precision requirements.
**Assistant interpretation:** Implement common normalization/attention prerequisites with explicit accumulation.
**Inferred user intent:** Expand reusable graph import beyond task-specific patterns.

### What I did
- Added axis binding, negative-axis normalization, duplicate/out-of-range diagnostics and Boolean keepdim validation.
- Added importer test and saved script 43 for source-derived multi-axis mean probes.
- Added GPU comparison driver with complete-artifact preconditions.

### Why
- Elementwise precision policy must not become per-add low-precision reduction rounding accidentally.

### What worked
- Fourteen integration CPU tests passed.
- FP32/FP16/BF16 probes compiled with loop-level reference checks passed.

### What didn't work
- No new failures at checkpoint; GPU result is still being observed. dtype override kwargs and dynamic axes remain explicitly unsupported.

### What I learned
- Keeping reduced axes as unit dimensions until final reshape avoids axis renumbering when reducing multiple dimensions.

### What was tricky to build
- Empty dimension list has reduce-all semantics; duplicate dimensions must fail rather than double-reduce silently.

### What warrants a second pair of eyes
- FP32 accumulation order, empty/zero-size inputs, scalar reductions and native dtype promotion require broader tests.

### What should be done in the future
- Observe GPU results, archive artifacts, validate real reduction tasks and retain full benchmark denominators.

### Code review instructions
- Review fx_import.py reduction branch, script 43 and check_reductions_cuda.py.

### Technical details
- Independent lowering to existing Kiln sum/cast/reshape operations. No upstream code copied; task coverage remains 3/200.

### Completed GPU outcome
FP32, FP16 and BF16 multi-axis mean probes passed PyTorch CUDA comparisons, including output shape/dtype. This is a small reduction probe, not complete real-task acceptance or broad accumulation proof.

## Step 61: Import static layout methods and explicit floating casts

Extended graph import with reshape/view, flatten, permutation, contiguous materialization and explicit floating casts. A source-derived multi-output chain compiled through Kiln and matched PyTorch CUDA exactly, including output shape and dtype. This extends primitives; verified task coverage remains 3/200.

### Prompt Context
See the original full-corpus implementation request and provenance requirements in earlier entries.
**Assistant interpretation:** Implement common layout dependencies while retaining explicit rejection of unsupported dynamic/device semantics.
**Inferred user intent:** Progress toward all 200 tasks rather than selecting only easy existing operations.

### What I did
- Extended fx_import.py method dispatch and tagged dtype decoding.
- Validated permutation rank, integer shape arguments and explicit cast dtype binding; rejected dynamic shape references and ambiguous casts.
- Saved scripts 44 (source export) and 45 (remote compilation/CUDA check).
- Added check_layouts_cuda.py with four shape/dtype/exact-value comparisons.

### Why
- Layout and floating conversions recur throughout the corpus and are prerequisites for normalization and attention paths.

### What worked
- Eighteen CPU integration tests passed with `python3 -m unittest discover -s integrations/passnet -p 'test_*.py'`.
- DGX compilation reported `end-to-end check ok at loop`.
- CUDA probe outputs 0/1/2 had shape (2,12), output 3 had shape (6,4); all four passed rtol=0, atol=0 against PyTorch.
- Reference benchmark container remained running and unpaused, with progress at 75/200. Per-task exit status is not yet a correctness summary.

### What didn't work
- No probe failures observed. Device conversion, noncontiguous external inputs and dynamic shape arguments remain unsupported.

### What I learned
- Composing pairwise transposes expresses arbitrary static permutations while preserving logical reshape order through the existing compiler.

### What was tricky to build
- Inferred output shapes alone must not silently replace runtime shape operands; those operands are validated as static integers before using metadata.

### What warrants a second pair of eyes
- View aliasing under mutation is not generally modeled. Accepted in-place operations remain restricted to fresh single-use convolution outputs.

### What should be done in the future
- Validate real layout/reduction tasks and implement the remaining normalization/attention dependencies based on the corpus inventory.

### Code review instructions
- Review fx_import.py call_method dispatch, test_fx_import.py and scripts 44/45; check sources/layouts/probe.json.

### Technical details
- Independent lowering to existing N.reshape/N.transpose/N.cast APIs; no PyTorch or PassNet implementation copied. The CUDA check uses the existing exploratory GB10 environment, with no timing claims.

## Step 62: Compile and check all 30 residual/mean task variants

Selected task e6f244f12cb8bf8954c9ac5adc78e6267f77f95f13ba6acc7420064393c0cb93 from the pinned corpus inventory. Its variants return both a residual sum and a spatial mean, with one or three input tensors. All 30 compiled and passed independent source-model CUDA comparisons for both outputs. Original evaluator acceptance is being measured separately.

### Prompt Context
See original whole-system implementation request and explicit script/provenance retention requirements.
**Assistant interpretation:** Apply completed reduction support to all variants of a genuine task.
**Inferred user intent:** Expand measured corpus support without hiding variants or reducing the denominator.
**Commit (preceding layout milestone):** 5eaac52.

### What I did
- Saved export/compile/CUDA/pass/evaluation drivers 46–51.
- Added check_fourth_task_cuda.py; require a complete successful compile receipt before execution.
- Preserved addition association and both outputs; dtype/shape-specific dispatch uses original argument order.
- Used a wrapped operator.iadd leaf in the match pattern to represent the source's fresh-intermediate mutation.

### Why
- Multi-output reductions exercise layout, accumulation, low-precision arithmetic and matcher behavior together.

### What worked
- Exported and compiled all 30 variants, with per-graph compile logs and receipts.
- CUDA driver completed indices 0–29 with PASS against each original source model at the benchmark dtype tolerances; both shape and dtype checked.

### What didn't work
- Initial tmux command redirected into absent remote directory `/home/manuel/passnet-kiln/KILN-005/logs`; no compile session or log appeared. Verified absence, then used existing root `fourth-compile.log` and started the job. No live job was restarted.
- Original evaluator results remain pending; coverage ledger unchanged until checked.

### What I learned
- A single task's operator pattern can include different tensor arities because scalar zeros occupy matching placeholders in some variants.

### What was tricky to build
- Generic pattern arguments are ordered by the addition tree, while each compiled artifact expects source input order. Dispatch retains that order and permits only captured scalar zeros.

### What warrants a second pair of eyes
- Pattern binding of scalar constants, fresh-only mutation semantics, and numerical behavior for large FP32 reductions.

### What should be done in the future
- Inspect original evaluator outcomes, score the task, then update coverage only from exact per-graph results.

### Code review instructions
- Start with script 46 and check_fourth_task_cuda.py, then inspect script 49 generated pass and per-graph receipts.

### Technical details
- Independent Kiln import/lowering; task model source comes from the pinned PassNet dataset. Compile target remains A100 scheduling proxy on GB10. No timing claims from the standalone CUDA comparison.

### Evaluator rule-loading failure and recovery attempt
The first isolated driver exited before graph evaluation with `[PassMgrBackend] Pass source validation failed` and `Line 4: blocked call 'torch.fx.wrap' (resolves to 'torch.fx.wrap')`, followed by `RuntimeError: No replacement functions available after filtering 0 rules.` This was the module-level wrapper-registration call for operator.iadd, not the permitted replacement callable decorator. Preserved the failure log. Removed this registration and used the ordinary source `value += x` in script 49's pattern. A second run tests actual matching without changing AST validation or any evaluator guard. Reference container was verified running/unpaused after the first exit.

## Step 63: Consolidate corpus execution and preserve pattern operator identity

Reassessed the implementation after the user explicitly requested consolidation. The repeated experiment scripts were the clearest source of architectural drift. Added shared manifest-driven export/compile and recursive CUDA correctness commands, and documented their ownership boundaries. The original numbered scripts remain preserved history.

### Prompt Context
**User prompt (verbatim):** "get it you supergenius. make sure to reassess if architecturally things are starting to sprawl and consolidate them"
**Assistant interpretation:** Consolidate repeated infrastructure while continuing real benchmark progress.
**Inferred user intent:** Maintain a coherent compiler integration as feature coverage expands.

### What I did
- Added corpus.py and check_corpus_cuda.py with explicit `kiln-passnet-corpus/1` manifests, identity checks and nested output comparison.
- Exported all 30 fourth-task variants using the shared command and validated all through the shared CUDA checker.
- Added three manifest validation tests; total integration suite now 22 passing tests.
- Added FX autowrap-based pattern tracing for explicitly imported operator.iadd; tests verify operator identity and numerical behavior.
- Added design document 04 with ownership, CLI usage, protocol boundaries and remaining consolidation work.

### Why
- Copying a task-specific checker risks comparing only one output or drifting input order and tolerances.
- Pattern tracing should preserve source operator identity without rewriting the target computation.

### What worked
- Shared exporter processed 30 variants; shared CUDA checker completed 0–29 with PASS.
- Local diagnostic 52 reproduced ordinary FX add versus Dynamo iadd and zero matches for both one- and three-input patterns.
- Explicit operator-preserving tracing loaded successfully through unchanged source validation.

### What didn't work
- Ordinary-source pattern run v2 failed matching with `RuntimeError: [PassMgrBackend] No passes modified the graph.`
- Operator-preserving run v3 reached replacement construction but the upstream standard backend crashed with a bare assertion. Inspection identified two pattern return nodes versus one opaque replacement result at custom_replacement.py's output arity assertion.
- The pinned upstream direct backend already provides explicit tuple destructuring. Reused its `_make_multi_output_replacement` helper with the standard backend's guarded callable; no implementation copied or check removed.
- v3 is diagnostic only: harness changed during the run and a standalone correctness job overlapped part of it. It cannot establish controlled timing or complete support. Once confirmed terminal, launched fresh isolated v4 with stable code and no other integration workload.

### What I learned
- Source-level numerical correctness, FX operator identity, replacement output structure and benchmark acceptance are independent gates.

### What was tricky to build
- Multi-output replacement requires getitem nodes in the traced replacement graph, not merely a Python callable that returns a tuple at runtime.

### What warrants a second pair of eyes
- New protocol hooks retain standard backend dispatch wrappers and upstream source validation. They are modified integration behavior, not unchanged reproduction results.

### What should be done in the future
- Observe clean v4 results, archive and score; consolidate task-specific pass generation/evaluation invocation next.

### Code review instructions
- Read design 04, corpus.py, check_corpus_cuda.py and evaluate_normalized.py. Provenance is the pinned upstream pass_mgr_direct.py helper.

### Technical details
- Additive protocol identities: kiln-pattern-autowrap/1 and kiln-pattern-multi-output/1. Existing normalized argument and record_stream policies remain explicit. No target arithmetic rewrite was introduced.

## Step 64: Complete the 30-variant residual/mean task under declared protocol

The clean isolated v4 run completed all 30 graphs with one replacement and one success result per graph, with no failure results. Exact graph-list membership was checked by the coverage builder. Verified coverage is now 4/200 tasks and 49/2,060 graphs. Original scoring yields approximately eager parity, not a robust measured performance improvement.

### Prompt Context
See the ongoing complete integration and measurement objective.
**Assistant interpretation:** Accept a task only after complete evaluator evidence, then compute the published metric.
**Inferred user intent:** Maintain an auditable path toward all 200 tasks.
**Commit (implementation):** 90b06d4.

### What I did
- Archived fourth-task-isolated-v4.log and ran the original scorer with p=0, fpdb=0.1 and original sample index 11.
- Extended coverage builder evidence mapping and per-task protocol identities.
- Checked the completed acquisition task using docmgr; broader reproduction and research tasks remain open.

### Why
- Independent CUDA probes cannot substitute for full task matching, correctness and scoring.

### What worked
- 30 successes, zero failure results, exactly one replacement per expected graph.
- Original scorer parsed all 30 samples and reported `aggregated_speedup=1.0032945157872568`.
- Reference container was verified running and unpaused after the isolated run.
- Shared infrastructure CPU suite: 22 tests passed; diff whitespace check passed.

### What didn't work
- Earlier failed/mixed-protocol runs remain archived and excluded from accepted evidence. Score proximity to 1 requires repeated measurements before any speedup claim.

### What I learned
- Correctness-first reduction lowering can reach aggregate eager parity for this task, while the earlier convolution task remains substantially slower.

### What was tricky to build
- The acceptance record must name additive autowrap/multi-output protocol identities only for the runs that actually used them.

### What warrants a second pair of eyes
- Isolated timing repeatability, error-aware score interpretation and precision on additional input distributions.

### What should be done in the future
- Expand operation coverage using the shared runner, profile weak schedules and complete the original baselines and agent experiments.

### Code review instructions
- Inspect sources/fourth-task-isolated-v4.log, fourth-task/score.json, kiln-coverage.json and script 21's exact membership accounting.

### Technical details
- Task e6f244f12cb8bf8954c9ac5adc78e6267f77f95f13ba6acc7420064393c0cb93; 30 FP32/FP16/BF16 graph variants, one or three input tensors, two outputs. Aggregate score is a task-level exploratory result on GB10, not an all-corpus or paper-hardware reproduction result.

## Step 65: Inspect graph metadata without allocating dataset tensors

Added optional FakeTensorMode propagation to FX export and made the shared corpus exporter use it by default. Fallback tensor kernels are disabled explicitly. All 30 fourth-task exports produced identical ordered manifest records and Kiln source compared with real CPU propagation. Launched a metadata-only import audit over the full pinned evaluation list.

### Prompt Context
See the full-corpus objective and the user's architectural consolidation request in Step 63.
**Assistant interpretation:** Obtain actionable import blockers across the full corpus through the shared runner.
**Inferred user intent:** Prioritize missing compiler work from evidence rather than ad hoc task selection.
**Commit (preceding task acceptance):** d6e5e67.

### What I did
- Extended export_graph with an explicit fake_mode parameter and documented interpretation semantics.
- Extracted translate_graph in corpus.py, added metadata-mode selection and complete corpus inspection command.
- Added fake/real metadata and lowering equivalence regression; 23 integration tests passed.
- Archived the installed PyTorch ShapeProp source, exact torch commit/hash provenance and official Fake Tensor documentation under sources/pytorch.
- Saved audit driver 56 and started it in local tmux.

### Why
- Large corpus tensors should not require materialization merely to find unsupported operators and shapes.

### What worked
- Fake propagation with fallback kernels disabled exported all 30 fourth-task variants identically to real propagation.
- Full audit made progress through 81 tasks/841 graphs at the observation checkpoint; imported status denotes only successful translation, never execution coverage.

### What didn't work
- Initial local tmux invocation failed `error connecting to /tmp/tmux-1000/default (Operation not permitted)` under the sandbox. Retried with authorized socket access; no process existed before retry.
- During refactoring, code inspection caught a local variable shadowing the graph path with a traced GraphModule before execution; translate_graph now retains separate source identity and traced variables. The complete 30-record equality check verifies identity preservation.

### What I learned
- PyTorch ShapeProp already accepts a fake mode; no tensor metadata engine or PyTorch implementation port is needed.

### What was tricky to build
- Fake mode can otherwise permit fallback kernels. Explicitly disable them so unsupported metadata operations become diagnostics rather than hidden execution.

### What warrants a second pair of eyes
- Fake metadata parity beyond the validated operator chain; symbolic tracing still executes trusted Python and is not a sandbox.

### What should be done in the future
- Finish and summarize the audit, prioritize blockers, and separately compile/check/evaluate importable tasks.

### Code review instructions
- Review corpus.py translate_graph/inspect_corpus, fx_export.py and test_fake_export.py. Inspect source provenance JSON and driver 56.

### Technical details
- Consulted installed torch.fx.passes.shape_prop.ShapeProp and official https://docs.pytorch.org/docs/main/user_guide/torch_compiler/torch.compiler_fake_tensor.html . Archived source is research material; no PyTorch implementation copied into Kiln. Audit format is kiln-passnet-import-audit/1 and must remain separate from kiln-coverage.json.

### Completed audit outcome
The audit finished all 200 tasks and 2,060 graphs. Script 57 verifies exact task/graph membership and detects duplicates before summarizing. Current import succeeds for 279 graphs, comprising 19 complete tasks. These are not compiled/verified coverage claims. First blockers include slice decoding (504 graphs), cat (135), unsupported input dtypes (118), linear (114), matmul (81) and softmax (70). Fifty-nine graphs fail trusted source tracing because this local machine lacks an NVIDIA driver; those environment failures must not be mislabeled compiler-operator gaps. Only the first blocker is counted, so these counts are not marginal feature unlock estimates.

## Step 66: Lower static basic tensor indexing in a focused module

Implemented static tensor getitem lowering after the complete import audit identified slice decoding as the first blocker for 504 graphs. The new fx_indexing.py module owns normalization and shape reconstruction, avoiding further expansion of the main importer. CPU checks pass; independent CUDA probes and a new full-corpus audit are running.

### Prompt Context
See full-corpus implementation objective and Step 63's architectural consolidation request.
**Assistant interpretation:** Address the largest observed first blocker with explicit semantic boundaries.
**Inferred user intent:** Expand compiler coverage while keeping implementation ownership clear.
**Commit (metadata audit):** df6eb82.

### What I did
- Added static slices, negative integer indices, ellipsis and None-axis handling.
- Lowered selections to N.slice with final reshape; checked output metadata against independently computed shape.
- Added ellipsis serialization and slice decoding to interchange/import.
- Added positive and rejection regressions; 26 integration tests passed.
- Saved scripts 58/59 for independent three-dtype, three-output indexing probes using shared corpus runners.
- Preserved the complete pre-indexing audit before rerunning inspection.

### Why
- Basic indexing is a graph-language dependency distinct from advanced gather or mutation/alias analysis.

### What worked
- CPU import tests cover combined slices/integer selection/None, ellipsis and explicit strided-slice rejection.

### What didn't work
- Strided slices and empty outputs remain explicit errors requiring further compiler support. No silent approximation or advanced-index fallback was added.

### What I learned
- Integer selection can retain unit dimensions through slicing, then remove them alongside inserted None axes in one reshape without changing logical element order.

### What was tricky to build
- Source-axis consumption differs for integer, slice, None and ellipsis; output-shape validation catches normalization mistakes.

### What warrants a second pair of eyes
- Indexing is value-semantic; mutation-dependent aliasing and external noncontiguous inputs remain unsupported.

### What should be done in the future
- Observe CUDA probe results and inspect the new full-audit blocker distribution before claiming unlocks.

### Code review instructions
- Review fx_indexing.py, fx_import.py getitem branch, fx_export.py ellipsis encoding and scripts 58/59.

### Technical details
- Independent lowering using Python slice.indices for bound normalization and existing Kiln slice/reshape. No PyTorch implementation port. Verified PassBench coverage remains 4/200 tasks, 49/2060 graphs until further original-evaluator results.

### Completed indexing validation
FP32, FP16 and BF16 probes compiled with successful loop-level reference checks and passed the shared CUDA checker for every output. Post-indexing audit again completed exact membership for all 200 tasks/2,060 graphs: 381 graphs and 21 complete tasks import successfully. These counts remain separate from verified benchmark coverage. The largest subsequent blocker is now `unsupported target torch.cat; implement semantic lowering` (531 graphs).

## Step 67: Deliver the updated guide and author the corpus milestone report

Uploaded the updated intern guide together with design document 04 as a new progress edition, preserving the previous edition and its annotations. Authored the milestone report explaining shared corpus ownership, operator-preserving matching, upstream multi-output helper provenance, accepted task evidence and complete import-audit limitations.

### Prompt Context
See original intern-guide delivery and detailed milestone-report requirements.
**Assistant interpretation:** Keep research deliverables current at the consolidation and complete-corpus-audit checkpoint.
**Inferred user intent:** Make the implementation understandable and reproducible for a new contributor.

### What I did
- Appended guide section 21 with current coverage, metadata inspection and indexing semantics.
- Uploaded guide plus consolidation design with remarquee upload bundle to a distinct Progress 02 name.
- Created reference/05-milestone-report-from-individual-probes-to-a-corpus-runner.md through docmgr and authored its technical analysis.

### Why
- Documentation must distinguish translation counts, numerical probes, benchmark acceptance and performance claims.

### What worked
- Exact delivery evidence: `OK: uploaded KILN-005 PassNet Intern Guide Progress 02.pdf -> /ai/2026/10/30/KILN-005`.
- Final affected integration gate: 26 tests passed; whitespace check passed.

### What didn't work
- Vault publication remains on hold after the previously documented automatic approval-review rejection for the existing go-go-parc GitHub destination. No new publication attempt or alternate route was used while its explicit approval question remains unanswered.

### What I learned
- A complete import audit materially changes prioritization, exposing concatenation after basic indexing removes earlier diagnostics.

### What was tricky to build
- Keep cloud delivery evidence distinct from physical device synchronization and keep pending vault publication distinct from completed ticket authorship.

### What warrants a second pair of eyes
- Review the milestone report's protocol identities, approximate-parity score and explicit numerical/coverage limitations.

### What should be done in the future
- Implement concatenation, continue full-corpus support and publish the prepared vault reports after destination approval is resolved.

### Code review instructions
- Read reference 05 and design documents 01/04, then inspect the exact coverage and import-audit receipts.

### Technical details
- New reMarkable name avoids overwrite. All checked source materials and intermediate experiment scripts remain within the ticket. Goal remains active and far from full 200-task execution support.

## Step 68: Implement typed concatenation and diagnose BF16 reference failure

Added a variadic concatenation primitive with independent reference copying and Tensor IR decomposition. Shape checks preserve all non-concatenated dimensions and normalize negative axes. The initial low-precision CUDA probe build stopped at BF16's internal reference check, which is being diagnosed before any acceptance claim.

### Prompt Context
See the complete compiler-support objective and architectural consolidation request in Step 63.
**User prompt (verbatim):** "dont forget to commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

how far are we?"
**Assistant interpretation:** Continue milestone commits and preserve failures and decisions in the detailed investigation format.
**Inferred user intent:** Keep progress auditable throughout implementation.

### What I did
- Added concat.js with shape validation, contiguous block-copy reference and safe indexed selection lowering.
- Added nn.concat/N.concat and decomposition, preserving FP32/FP16/BF16 output types.
- Added torch.cat/concat/concatenate/ATen import with explicit casts to the propagated output dtype for mixed floating inputs.
- Added compiler reference/decomposition/dtype/special-value checks; 27 integration CPU tests passed.
- Saved scripts 60–62 for multi-output homogeneous/mixed probes, compiler regressions and reference-input diagnosis.
- Archived consulted official torch.cat documentation. No PyTorch or PassNet implementation copied into Kiln.

### Why
- Concatenation was the first import blocker for 531 graphs after indexing support. Safe selection must avoid out-of-bounds loads even when the backend evaluates both branches.

### What worked
- Local Node 26 concatenation reference and decomposition checks passed for multiple axes and all three floating storage types.
- NaN, infinity and negative zero selection checks passed without replacing selection by arithmetic masking.
- The new exact full-corpus import audit finds 804 graphs across 24 complete tasks importable, versus 381/21 previously; this is not execution coverage.

### What didn't work
- Remote build compiled FP32 and FP16 probes but BF16 exited nonzero with `: end-to-end check FAILED`. Broad compiler suite and CUDA checks therefore did not run in that driver.
- Suspected invalid synthetic reference inputs: Project.inputsFor generates FP32 random values even when storage is declared BF16, while the new typed select rounds its result. Script 62 compares the original and explicitly rounded input domains without weakening checks.

### What I learned
- Removing a first blocker exposes additional operators in many graphs; importable graphs increased much more than complete importable tasks.

### What was tricky to build
- Unselected input coordinates are clamped before loading. Static per-axis masks select the correct segment and explicit result dtype avoids accidental FP32 promotion by the mask.

### What warrants a second pair of eyes
- Static mask size and unselected reads may be inefficient; empty tensors, integer concatenation and output-buffer mutation remain unsupported.

### What should be done in the future
- Resolve the BF16 check from evidence, complete compiler/GPU validation, then run a real concatenation task through PassBench.

### Code review instructions
- Review concat.js, nn.concat infer/decompose, fx_import.py concatenation binding and scripts 60–62.

### Technical details
- First lowering uses O(number of inputs × concatenated axis length) static mask storage and may load all operands. It establishes safe semantics rather than an optimized concat dispatch. Original verified coverage remains 4/200 tasks and 49/2060 variants.

## Step 69: Correct typed reference inputs and qualify concatenation probes

Script 62 isolated the BF16 compiler-check failure to synthetic inputs outside the declared storage domain. Converted Project reference inputs to FP16/BF16 representation without mutating caller Tensor data. After the correction, all four concatenation probes compiled and passed PyTorch CUDA comparisons, and all 24 compiler test files passed.

### Prompt Context
See the full compiler reliability objective and detailed diary reminder in Step 68.
**Assistant interpretation:** Correct the input-domain defect rather than weakening a failing numerical check.
**Inferred user intent:** Preserve scientific validity as compiler coverage grows.

### What I did
- Preserved before/after diagnostic JSON: BF16 max absolute error 0.0018287301063537598 before rounding, zero for all outputs after rounding.
- Changed Project.inputsFor to prepare representable low-precision values in a new Tensor; added generated/custom input and ownership regression.
- Reran the complete probe driver, including broad compiler tests and shared CUDA checker.
- Wrote design document 05 with semantics, safe-load argument, reference-input correction, validation and performance limits.

### Why
- Reference validation must use the same values the declared device storage can represent.

### What worked
- All four programs (FP32, FP16, BF16, mixed) compiled with internal checks enabled.
- All 24 compiler test files passed; all four programs passed CUDA comparisons for every output.
- Complete post-concat import audit: 804 graphs / 24 complete tasks, versus 381/21 before this change.

### What didn't work
- Original failed BF16 compile and its diagnostic remain archived. No tolerance or benchmark guard changed.

### What I learned
- Typed data movement exposed a pre-existing reference-input defect that low-precision arithmetic operations had partly hidden by rounding their reference outputs.

### What was tricky to build
- Generated and explicit project data must both be represented correctly, while caller-owned Float32Array storage remains untouched.

### What warrants a second pair of eyes
- Extending reference-input representation to integer types and ensuring all future reference entrypoints honor storage semantics.

### What should be done in the future
- Validate a complete real concatenation task and profile memory traffic before optimizing the initial mask/select strategy.

### Code review instructions
- Review Project.inputsFor, project-input-dtypes.mjs, design document 05 and concat-reference-diagnostic.json.

### Technical details
- CUDA probes ran on GB10 with the existing exploratory PyTorch environment. The original baseline remains independent and was verified running/unpaused at 108/200. No full-paper or corpus-wide execution claim.

## Step 70: Share typed dispatch and evaluator execution for the fifth task

The real concatenation/slice/spatial-mean task exported and compiled all 24 variants and passed standalone CUDA comparison for both outputs. Replaced another task-specific dispatch loop with CorpusDispatch and introduced a shared per-graph evaluator runner. A complete isolated original-evaluator run is now in progress.

### Prompt Context
See full task-support objective and architectural consolidation request in Step 63.
**Assistant interpretation:** Keep task-specific code restricted to the actual match pattern and specialization extraction.
**Inferred user intent:** Scale evaluation without multiplying subtly different runtimes and shell loops.
**Commit (compiler concatenation milestone):** 7126b49.

### What I did
- Added dispatch.py: metadata/constant keys, conflict detection before loading, complete output reconstruction, cleanup and explicit missing-program errors.
- Added run_task.py: explicit import paths, fresh evaluator process per graph, original config, complete raw logs and process receipts. It does not interpret exit zero as numerical correctness.
- Added dispatch tests for conflicting programs, typed constants, nested outputs and no fallback; 30 integration tests passed.
- Saved scripts 63–66 for slice-pattern diagnosis, generated literal patterns, shared compilation/checking and isolated evaluation.
- Generated four literal slice patterns (120,480,672,960 channels) sharing one stable module-level callable across 24 variants.

### Why
- The original structural matcher does not bind placeholders nested in slice bounds. Matching each literal variant is explicit and keeps the original matcher unchanged.
- Dispatch should use metadata and declared constants, never inspect input tensor values or fall back to eager arithmetic.

### What worked
- All 24 source variants compiled and passed shared CUDA correctness checks.
- Local structural diagnostic showed zero matches for a placeholder nested in a slice stop; preserved in script 63.
- CPU integration suite passed 30 tests.

### What didn't work
- Generic slice-stop placeholder did not match a literal stop; used a finite source-derived pattern family instead, with no matcher relaxation.
- Original evaluator acceptance remains pending and is not yet included in coverage.

### What I learned
- A reusable runtime can serve several pattern modules while retaining the benchmark's one-stable-replacement-callable constraint.

### What was tricky to build
- Different source graph families use different literal channel truncations. Specialization constants are typed, finite scalar keys; duplicate metadata keys with different source programs fail before CUDA initialization.

### What warrants a second pair of eyes
- Audit shared dispatcher for metadata-only selection, stable callable identity and complete output reconstruction. Generated helper/pattern files are archived with source scripts.

### What should be done in the future
- Observe original matching/checking results, score only complete accepted evidence and continue operator-family expansion.

### Code review instructions
- Start at dispatch.py, run_task.py and scripts 64/66, then inspect fifth-task manifest and CUDA receipts.

### Technical details
- Corpus task 51a847653153f19ac9458aa2cbe628f3e08c96fc3829a150d5f4006b5add6665, 24 variants across FP32/FP16/BF16. Graph operations are concat, static channel slice and spatial mean; two outputs. No new evaluator guard exception introduced.

## Step 71: Verify the fifth task and prioritize self-optimization

All 24 fifth-task graph variants completed the original evaluator under the declared integration protocol, with one replacement and one success result per expected graph. The exact coverage builder now reports five tasks and 73 variants. The user requested a shorter path to self-optimization, so the roadmap now separates broad corpus support from the first reusable-policy experiment.

### Prompt Context
**User prompt (verbatim):** "ok can we somehow streamline things to get to the self-optimization part?"
**Assistant interpretation:** Start a rigorously measured compiler-policy experiment on a fixed supported corpus before implementing every unrelated operation.
**Inferred user intent:** Reach the research question sooner while retaining the broader support goal.
**Commit (shared runner):** ffa7e7e.

### What I did
- Archived complete fifth-task raw evaluator log, process receipts, GPU/compile receipts and original score.
- Added original sample index 198 to coverage evidence, retaining per-record protocol identities.
- Updated the roadmap with a training/held-out family split, unchanged Kiln baseline, replaceable fusion policy and artifact-change gate.

### Why
- All 200 tasks are needed for broad evaluation coverage, but not as a prerequisite for the first controlled compiler-policy experiment.

### What worked
- Exact coverage: 5/200 tasks, 73/2060 graphs; all 24 new graphs matched once and passed.
- Original scorer parsed 24 samples and reported aggregated_speedup=0.8485481515793615.
- Reference workload resumed and remained running/unpaused; last report-preparation observation was 121/200 tasks.

### What didn't work
- The fifth task remains slower than eager. No reusable-policy optimization experiment or held-out improvement has been run yet.

### What I learned
- The supported graph set is sufficient to begin selecting a policy experiment, but it must first be checked for real decision/artifact sensitivity to avoid a vacuous parameter search.

### What was tricky to build
- Distinguish direct compiler experiments from original benchmark acceptance, preserving both evidence paths without treating one as a substitute for the other.

### What warrants a second pair of eyes
- Family split leakage, compiler-policy scope, candidate budget and measurement stability.

### What should be done in the future
- Freeze eligible graphs, expose fusion policy and run the first controlled training/held-out experiment; continue full corpus support as a parallel track.

### Code review instructions
- Inspect fifth-task-isolated.log, fifth-task/score.json, coverage ledger and roadmap priority section.

### Technical details
- New task score is an exploratory GB10 aggregate under modified integration protocol, not a published hardware reproduction result. Default fusion guard remains unchanged at 1.02.

## Step 72: Publish the detailed project report to the Obsidian vault

Authored a roughly 4,400-word technical report covering the implementation through e98a315, then saved matching ticket and vault copies. The report defines the coverage stages before presenting counts, explains architecture and numerical failures, records all five task scores and distinguishes the proposed self-optimization experiment from work already completed. Committed and pushed the new vault note successfully.

### Prompt Context
**User prompt (verbatim, line break escaped):** "write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).      \n Commit and push the bsidian vault when done (go-go-parc vault).    About things so far"
**Assistant interpretation:** Publish a comprehensive evidence-backed current-state article, with conceptual foundations, technical algorithms, diagrams, results and limitations.
**Inferred user intent:** Preserve the work so far as a readable technical account and clarify progress toward reusable compiler optimization.
**Commit (vault):** d081b7a — docs: report PassNet Kiln integration and self-optimization plan.

### What I did
- Read the vault-writing and textbook-authoring skills and the previous historical vault article.
- Wrote reference/06-project-report-passnet-kiln-integration-and-the-path-to-self-optimization.md and a new dated ARTICLE note in go-go-parc.
- Added script 68 to check exact coverage, import counts, all five score values and compiler/probe outcomes against saved receipts.
- Added Mermaid dataflow, a concrete small tensor example, precision and concat pseudocode, protocol identities, failure analysis and the proposed training/held-out experiment.
- Staged and committed only the new vault note; verified the configured push remote was ssh://git@github.com/go-go-golems/go-go-parc.

### Why
- Earlier progress updates mixed importable and verified counts too closely. The article makes each evidence stage explicit and does not equate translation with execution support.

### What worked
- Script 68 verified 5/200 accepted tasks, 73/2060 accepted graphs, 804 imported graphs and 24 completely imported tasks; all score values matched.
- Vault/ticket article bodies matched and fenced blocks were balanced; Git whitespace checks passed.
- Push completed: `2c3cc7f..d081b7a main -> main` to the existing go-go-parc remote.
- Prior historical notes and unrelated vault working changes were preserved.

### What didn't work
- No new publication failure. The earlier publication hold was resolved after the user renewed the explicit vault commit/push request; the new report consolidates the current findings rather than publishing stale intermediate drafts as current results.

### What I learned
- Defining task, variant, import, compilation and benchmark acceptance early is necessary to prevent misleading interpretations of partial coverage.

### What was tricky to build
- Keep measured task aggregates separate from GPU-only speedups, direct compiler experiments separate from PassBench acceptance, and planned policy search separate from actual held-out results.

### What warrants a second pair of eyes
- Review the convolution stress limitation, modified protocol identities, approximately-parity score and family-split proposal before using the report as research evidence.

### What should be done in the future
- Resume the prioritized self-optimization path: freeze eligible graph families, establish unchanged-Kiln measurements and expose the fusion profitability policy.

### Code review instructions
- Read reference 06, run script 68 and inspect sources/project-report-facts.json; the vault article is Projects/2026/10/30/ARTICLE - PassNet and Kiln - Compiler Integration and the Self-Optimization Experiment.md.

### Technical details
- Source implementation snapshot e98a315; vault commit d081b7a. Reference baseline was observed at 121/200 invocations during report preparation and remains incomplete. No full-corpus score, completed PassAgent reproduction or learned compiler improvement is claimed.

## Step 73: Expose fusion profitability and freeze the first policy corpus

Implemented createFusionRule with the existing matcher/inlining mutation and a replaceable profitability decision. The unchanged mergeLoopOps export is constructed with the original 1.02 threshold. Froze seven real FP32 graphs from four previously accepted task families, with training and held-out task/model separation, and prepared an unchanged compiler control plus five threshold policies. GPU policy timing has not started.

### Prompt Context
See Step 71's verbatim request to streamline toward self-optimization.
**Assistant interpretation:** Build the smallest controlled compiler-policy experiment with genuine real-graph code generation and held-out evaluation, while preserving the full project objective.
**Inferred user intent:** Reach reusable compiler optimization before completing unrelated operator expansion.

### What I did
- Added a policy factory with immutable original/fused weighted-work features, consumer count and producer size, optional decision callback and observation callback.
- Exposed it through std.loop and existing pipeline.replaceRule API.
- Added fusion-policy.mjs for default behavior, correctness, changed kernel construction and immutable diagnostics.
- Saved scripts 69–71 for frozen corpus selection, controls/reference domains and policy compilation.
- Added compile_policy.mjs with source-hash checks, recorded decisions, compile cost, reference-check results, kernel identities and executable fingerprints.

### Why
- Policy search needs a measurable change in compiler decisions; a threshold sweep whose artifacts are identical supplies no performance signal.
- WorkOf includes weighted memory reads/writes (weight 12), not just scalar arithmetic. Policies and documentation must use that actual cost model.

### What worked
- Local Node 26 policy regression passed with kernel counts [2,2,5] for unchanged/default/disabled controls and preserved numerical values.
- Frozen corpus: three training graphs from task families 0/11 and four held-out graphs from 1/198, all FP32, at most 20M input elements and no source-model overlap.
- Frozen membership SHA256 b9fba0d932df1cf24e31b3590ea2210163739f96d0f5a16ad51b5f022ff85d68.

### What didn't work
- Initial test expected relaxed threshold 2 to change a small fanout example, but counts were [2,2,2]. The existing weighted memory savings already justified default fusion. Replaced that assumption with a strict disabled-fusion control; it changes construction to five kernels.
- First reference-domain extractor assumed the batch_norm variance was a direct source input name and failed `ValueError: Cannot identify batch_norm running variance` on aliases. Replaced AST name assumptions with FX reference resolution.
- The initial remote compiler job then terminated with ENOENT for policy-corpus-v1/reference-domains.json. Confirmed its session absent before staging the corrected sidecar and starting v2; preserved the initial log.

### What I learned
- Input-domain constraints are part of a valid reference experiment. Running variance must be positive for synthetic checks; source replay remains the separate GPU correctness input.

### What was tricky to build
- Preserve graph membership after freezing while adding an explicit, separately hashed reference-domain sidecar. The same sidecar applies to every compiler policy.

### What warrants a second pair of eyes
- The held-out set is new to policy-search feedback, not a globally blind benchmark: its task families were observed during integration. The selection is deliberately small and exploratory.

### What should be done in the future
- Observe complete control compilation, verify default fingerprints equal unchanged compilation, then run training-only timing/selection before held-out timing.

### Code review instructions
- Review createFusionRule, fusion-policy.mjs, compile_policy.mjs, frozen manifest and reference-domains.json. Every candidate uses unchanged legality and code generation infrastructure.

### Technical details
- Controls: unchanged baseline, thresholds 0,1,1.02,1.25,2. No learned improvement is claimed. Graph selection and split were frozen before candidate timing; default compiler behavior remains unchanged.

## Step 74: Qualify the compiler controls and strengthen held-out applicability

All six policies compiled over the seven-graph pilot corpus, and the configurable default produced identical executable fingerprints to unchanged Kiln. Relaxed policies reduced the training LINKX graph from two kernels to one, but changed no pilot held-out artifact. Before any timing, froze an expanded ten-graph corpus adding distinct RepViT and RepGhostNet held-out families. Its relaxed policy changes one held-out program from three kernels to two.

### Prompt Context
See the user's streamlined self-optimization request in Step 71.
**Assistant interpretation:** Ensure the held-out set can exercise the policy intervention while keeping performance feedback unavailable to candidate selection.
**Inferred user intent:** Obtain a meaningful reusable-policy experiment rather than a parameter sweep over identical executables.

### What I did
- Added source/semantic artifact verification and per-file SHA256 qualification in script 72.
- Preserved version 1 as structural preflight; added version 2 with unchanged training membership and extra held-out task indices 81/153.
- Froze measurement-plan.json: 20 warmups, 100 trials, three repeats, IQR <=20%, at most two retries, seeded per-repeat order and identical-artifact deduplication.
- Added direct policy correctness/timing runner and training-only family-balanced selector.
- Added selector tests for equal family weighting, rejection of held-out feedback, failure exclusion and complete membership. Python integration suite passed 34 tests; compiler suite passed all 25 files.

### Why
- A held-out set whose artifacts do not change can detect regressions but cannot demonstrate a benefit of the relaxed policy.
- Family weighting prevents large shape families from dominating selection through variant count alone.

### What worked
- All 60 expanded policy/graph combinations compiled; actual default/unchanged semantic bodies match, not merely receipt metadata.
- Version 2 membership SHA256 7bf086a3e2968974db811a38283e95471e711d6b670f0a8dcb56aed2e495dcbf.
- Expanded split has three training graphs from two families and seven held-out graphs from four distinct families, with no source-model overlap.

### What didn't work
- The original pilot offered no nontrivial relaxed-policy held-out contrast. It remains archived as preflight, with no timing-based result claimed.

### What I learned
- The structural sensitivity gate is useful before spending measurement budget and before treating a held-out split as an improvement experiment.

### What was tricky to build
- Timing may be shared only for genuinely identical executables. Qualification now hashes actual artifact files and checks semantic bodies; later measurement validates these bytes before loading.

### What warrants a second pair of eyes
- This development corpus is drawn from the published evaluation list; it is not an untouched paper test set. Training/held-out terminology refers specifically to policy-search performance feedback.

### What should be done in the future
- Run training correctness and timing under GPU isolation, record one selected policy, then run only that policy against unchanged Kiln on held-out graphs.

### Code review instructions
- Read design document 06, compile_policy.mjs, measure_policy.py, select_policy.py and script 72. Inspect frozen plan and sensitivity.json.

### Technical details
- JavaScript pipeline/reference/export cost and CUDA program-load cost are separate fields. Selection optimizes synchronized end-to-end latency with compile-cost coefficient zero for this pilot. CUDA event measurements are stream elapsed time including dispatch gaps, not pure kernel-only duration.

## Step 75: Select a reusable fusion threshold from training measurements

The isolated training study completed correctness checks and three repeated timing rounds for every distinct executable on all three training graphs. Family-balanced selection chose maxWorkGrowth=1.25, with a training end-to-end score of 1.1174679569686872 relative to unchanged Kiln. Held-out timing has not run and was not used for selection.

### Prompt Context
See the prioritized self-optimization objective in Step 71 and frozen protocol in Step 74.
**Assistant interpretation:** Record the chosen compiler policy before observing held-out performance.
**Inferred user intent:** Demonstrate reusable compiler optimization with a controlled train/test boundary.
**Commit (compiler and frozen protocol):** 7a20a9b.

### What I did
- Saved isolated training and selection drivers 74/75.
- Measured synchronized end-to-end and CUDA stream elapsed latency using original source replay inputs, fixed plan, randomized repeat order and artifact deduplication.
- Checked source outputs and input preservation for each distinct executable before timing.
- Ran the training-only family-balanced selector and archived raw samples, retries, selection and isolation log.

### Why
- A policy must be chosen from training feedback alone; held-out results must not become another search objective.

### What worked
- All distinct training executables passed correctness and completed stable measurement rounds.
- Selected relaxed125; relaxed2 ties exactly because its executables are identical, so declared order prefers the lower threshold.
- Training family-balanced scores: relaxed125/relaxed2 1.1174679569686872; unchanged/strict/default 1.0; disabled 0.3226752368174381.
- LINKX normalization median end-to-end latency: unchanged 0.024178 ms, relaxed 0.019362 ms. The two residual/mean training graphs are unchanged for relaxed policy and share exact artifact timing evidence.
- Reference container was verified running/unpaused after the driver exited.

### What didn't work
- No correctness/stability failures in this training run. No held-out result or broad compiler improvement is claimed yet.

### What I learned
- Allowing some repeated normalization work can save a launch and intermediate storage on this hardware; the old work guard's conservative estimate has measurable headroom in this training case.

### What was tricky to build
- Identical policy artifacts must not compete through timing noise. They share one qualified executable measurement, with aliases explicit in the receipt.

### What warrants a second pair of eyes
- Small development corpus, warm repeated inputs and single-device timing limit generality. The score is relative to unchanged Kiln, not eager or the official PassBench metric.

### What should be done in the future
- Measure only unchanged Kiln and this selected policy on the frozen held-out set, then report exact membership, correctness, artifact changes and timing uncertainty.

### Code review instructions
- Inspect policy-measurements-v1/train.json and selection.json, select_policy.py, and the frozen measurement plan before looking at held-out data.

### Technical details
- Three training graphs across two families; 20 warmups, 100 trials, three repeats and IQR gate retained. Compile-cost coefficient is zero. This is scalar policy tuning, not a newly synthesized rewriting algorithm or completed recursive compiler improvement.

## Step 76: Measure selected-policy transfer and complete numerical stress

The committed 1.25 policy passed all seven held-out graph evaluations and measured family-balanced end-to-end speedup 1.0186065904267643 relative to unchanged Kiln. One RepViT graph changed from three kernels to two, with speedup 1.158915720454182; the other six artifacts were identical. Post-selection numerical stress passed all 60 graph/policy/seed comparisons. This qualifies a small reusable scalar-policy tuning milestone, not a new rewriting algorithm or broad benchmark completion.

### Prompt Context
See the self-optimization priority in Step 71 and frozen experiment in Steps 74–75.
**Assistant interpretation:** Evaluate the training-selected compiler policy unchanged, then verify it on nontrivial domain-valid inputs without retuning on held-out results.
**Inferred user intent:** Establish evidence of transfer before claiming compiler improvement.
**Commit (selection fixed before held-out timing):** 575effd.

### What I did
- Saved driver 76 with selection-file SHA256 verification and GPU isolation.
- Added summarize_policy.py with frozen membership checksum, exact train/held-out graph accounting and enforcement of baseline-plus-selected-only held-out evaluation.
- Saved scripts 77–79 for summary reproduction, numerical stress and final evidence audit.
- Ran selected and unchanged programs on random FP32 inputs for seeds 1,7,42, satisfying source-derived running-variance domains; retained all comparisons.

### Why
- Benchmark replay inputs may not expose numerical differences introduced by a changed fusion boundary. The selected policy must remain fixed during these follow-up checks.

### What worked
- All seven held-out graphs qualified; family-balanced synchronized e2e speedup 1.0186065904267643 and stream-elapsed speedup 1.0203162784302078.
- Changed RepViT graph: 0.0362335 ms -> 0.031265 ms, three kernels -> two. Paired repeat e2e ratios: 1.152337499801974, 1.1595091042913375, 1.1545818007356468.
- The changed graph's within-repeat IQR fractions were approximately 0.9–1.4%, below the frozen 20% gate.
- All 60 numerical stress comparisons passed; maximum output error 3.814697265625e-06.
- Reference container was verified running/unpaused after both held-out and stress drivers exited.

### What didn't work
- No failure in the completed held-out or stress run. Only one held-out artifact changed, so the result is narrow transfer evidence and not seven independent speedup demonstrations.

### What I learned
- A reusable profitability threshold can transfer from LINKX inference normalization to a different RepViT residual/mean/normalization pattern on GB10. The gain is consistent with eliminating a launch/intermediate while accepting more weighted work; separate cost contributions were not isolated.

### What was tricky to build
- Keep numerical robustness checks separate from policy selection and preserve exact artifact aliases. Six unchanged held-out programs share baseline timing evidence rather than introducing independent noise.

### What warrants a second pair of eyes
- Curated applicability set from evaluation tasks, FP32 only, one device, three warm repeats, and a single changed held-out program limit generality. No formal confidence interval or untouched paper-benchmark claim is justified.

### What should be done in the future
- Publish the bounded milestone, retain 1.02 global default, then extend to generated feature-dependent policies on a new reserved confirmation corpus and compare equal search budgets.

### Code review instructions
- Inspect frozen selection commit, heldout.json, stress.json, summary.json and verified-facts.json. Run scripts 77 and 79 to reproduce accounting.

### Technical details
- Direct compiler-policy study, not official PassBench scoring. Verified PassBench coverage remains 5 tasks / 73 graphs; these selected FP32 experiments do not add complete benchmark tasks. Default 1.02 is unchanged and the selected 1.25 policy is explicit through createFusionRule.

## Step 77: Publish the first policy-result report and refresh the intern guide

Published a roughly 2,200-word technical article explaining the measured scalar-policy transfer result, its train/held-out boundary and its limits. Updated the intern guide's opening status and marked older sections as historical checkpoints so import counts and accepted coverage are not confused with current facts. Delivered a new reMarkable progress edition containing the current guide and experiment design.

### Prompt Context
See the standing milestone-report and reMarkable delivery requirements, and the user's clarification questions about coverage in the preceding project-report turn.
**Assistant interpretation:** Publish the positive result at its actual scope and keep the primary onboarding document current.
**Inferred user intent:** Make research progress reviewable without overstating corpus support or generality.
**Commit (result evidence):** 7ce40f6.
**Commit (vault):** 2383314.

### What I did
- Authored reference/07-milestone-report-first-measured-reusable-fusion-policy-improvement.md and a matching new vault ARTICLE note.
- Explained weighted work, candidate controls, structural preflight, training-only selection, identity aliases, repeat variability and seeded numerical checks.
- Added a concrete RepViT dataflow and actual weighted-work ratios from decision traces.
- Updated guide Section 1 and Section 10 to current evidence; marked Sections 11–21 as historical; added current API/result Section 22.
- Committed/pushed only the new vault note and uploaded a distinct Progress 03 edition to preserve earlier annotations.

### Why
- The result is useful evidence of reusable policy tuning but is narrow: FP32, one GPU, a curated development split and one changed held-out executable.

### What worked
- Vault push completed `d081b7a..2383314 main -> main`.
- Delivery evidence: `OK: uploaded KILN-005 PassNet Intern Guide Progress 03.pdf -> /ai/2026/10/30/KILN-005`.
- Ticket and vault report bodies match; artifact and numerical facts verified with script 79; Git whitespace check passed.

### What didn't work
- No publication/delivery failure. Broader coverage, richer generated policies and independent confirmation remain unfinished.

### What I learned
- A current status section plus explicitly historical checkpoints prevents older progress numbers from looking like regressions or stronger present support.

### What was tricky to build
- Explain 1.1589x speedup on one changed graph alongside 1.0186x family-balanced aggregate without treating unchanged artifact aliases as independent gains.

### What warrants a second pair of eyes
- Curated applicability selection, single-device warm timings, default preservation and the distinction between direct compiler metrics and official PassBench scores.

### What should be done in the future
- Continue toward feature-dependent generated policies on a fresh reserved confirmation set, with fixed search budgets; keep full reproduction/support as an active separate track.

### Code review instructions
- Read report 07 and guide Section 22, then inspect verified-facts.json and raw heldout/stress receipts. Global fusion default remains 1.02.

### Technical details
- Native policy result is relative to unchanged Kiln and does not change verified PassBench coverage of five tasks / 73 graphs. ReMarkable success proves cloud delivery, not physical synchronization. The overall project goal remains active.

## Step 78: Compile bounded feature programs on a fresh frozen corpus

Extended the policy intervention from scalar thresholds to validated decision trees over compiler features. Froze 20 previously unused FP32 source programs from the official training list, with 12 training and eight held-out graphs from distinct exact models. All eight declared candidates compiled on all 20 graphs. Structural qualification shows that the proposed trees change no executables; the broad 1.25 scalar changes one held-out executable only. This is evidence of an ineffective proposal set on the training corpus, not a reason to revise the frozen experiment after inspection.

### Prompt Context
See Step 71 for the user's streamlining request and the standing implementation/diary instructions. The subsequent coverage clarification prompted explicit separation of importer, PassBench acceptance and direct policy-study counts.
**Assistant interpretation:** Advance from scalar tuning toward generated reusable compiler policies while retaining independent evidence.
**Inferred user intent:** Reach self-optimization without conflating a small experiment with full benchmark support.

### What I did
- Added fusion_policy.mjs: bounded decision-tree interpreter over originalWork, fusedWork, consumerCount and producerElements; integrated it with compile_policy.mjs and the existing createFusionRule callback.
- Added immutable-closure, validation and real-compiler numerical tests. Added reference_domains.py and qualify_policies.py to replace duplicated experiment-specific helpers for new studies.
- Preserved scripts 80–83. Script 80 deterministically scanned 516 task directories (920 audit records), excluded previously observed source models/program hashes, and selected one graph per model/task. Script 81 froze candidate programs, domains, tensor-volume audit and timing plan before performance measurement.
- Archived all 160 compiled artifacts and structural qualification under sources/policy-artifacts-v3.

### Why
- Generated programs should make reusable decisions from compiler metadata, with the existing compiler retaining transformation legality and mutation. Fresh official-training sources avoid reusing the prior study's held-out graphs as new confirmation evidence.

### What worked
- Node 26 test_fusion_policy.mjs passed, including actual fusion-boundary changes and preserved evaluated values.
- Python integration suite: 34 tests passed.
- All 160 programs compiled; default and unchanged executable bodies match on all graphs; no cross-split baseline executable aliases were found.
- Frozen membership SHA256: 3012570a49bd83e072278df39e3d7f30478ad7990156a371242ae739c4ffde8e.
- Original reference log reached 200/200 attempted tasks. Correctness and timing validity require a separate audit.

### What didn't work
- An initial Boolean-leaf test failed with `AssertionError: validated Boolean leaf must not retain a mutable JSON reference`: actual `policy boolean: profitability rejected`, expected true. Capturing the validated Boolean value rather than retaining node.accept fixed the mutation leak.
- All proposed feature trees and scalar108 alias the unchanged compiler across the fresh corpus. scalar125 changes only the held-out upernet-convnext-tiny graph from two kernels to one. Training-only selection therefore cannot justify choosing it based on performance in this experiment.

### What I learned
- More expressive policy syntax does not imply useful interventions. Structural sensitivity is a necessary diagnostic before interpreting timing differences; identical programs must share evidence rather than yield noise-driven winners.

### What was tricky to build
- Validation must compile immutable scalar closures, not retain mutable JSON leaves. Both threshold and Boolean branches require snapshots. Hard limits apply even to unconditional acceptance leaves.

### What warrants a second pair of eyes
- Exact-model separation is weaker than architecture-family separation. Deterministic eligibility excludes heavy unsupported operators and is not representative full-corpus sampling. Proposal authorship is the current Codex session; no separately identified serving snapshot or upstream PassAgent reproduction is claimed.

### What should be done in the future
- Complete the registered training/confirmation protocol without changing proposals; then use training decision traces to create a new explicitly versioned synthesis experiment. Audit the completed reference logs independently.

### Code review instructions
- Start with fusion_policy.mjs and its real-compiler test, then scripts 80–81, manifest/measurement plan and sensitivity.json. Reproduce qualification with qualify_policies.py; confirm no fresh GPU timing was used to alter membership or candidates.

### Technical details
- Maximum 31 decision nodes, depth six, finite nonnegative features/cutoffs, thresholds in [0,2], hard fusedWork/originalWork cap two. No eval, imports or tensor values are exposed. Global default remains 1.02. This study adds no verified complete PassBench tasks; accepted coverage remains five tasks / 73 graphs under modified protocols.

## Step 79: Preserve a negative training result and freeze unchanged selection

Completed the fresh corpus's 12-graph training measurement. Every declared candidate shares the unchanged compiler's executable on every training graph, so all candidates tie at exactly 1.0 and the registered ordering selects baseline. The experiment therefore supplies no evidence of policy improvement on this corpus. Selection is frozen before confirmation timing.

### Prompt Context
See Step 78 and the standing self-optimization, evidence and diary requirements.
**Assistant interpretation:** Retain unsuccessful hypotheses and follow the training-only selection rule.
**Inferred user intent:** Produce reliable compiler research rather than select improvements retrospectively.
**Commit (frozen experiment):** a914e0f.

### What I did
- Ran registered driver 83 on the DGX, archived train.json and computed selection.json using select_policy.py.
- Saved source-staging driver 84, original-reference audit driver 85, and selection-hash-checked held-out driver 86.
- Related design 07 to the interpreter, qualification code and frozen plan with docmgr.

### Why
- A feature program that does not change generated code cannot establish a performance improvement. Exact artifact ties should preserve the unchanged compiler.

### What worked
- All 12 distinct training executables passed replay correctness and completed stable timing; all eight declared candidates remain eligible and share those measurements.
- Training selection: baseline, score 1.0, heldout_feedback_used=false.

### What didn't work
- The first training attempt terminated with `FileNotFoundError: [Errno 2] No such file or directory: '/work/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/1/samples/timm/hgnetv2_b0.ssld_stage1_in22k_in1k/_decomposed/hgnetv2_b0.ssld_stage1_in22k_in1k_start146_end150_4/input_meta.py'`.
- The fresh source replay directories had not been staged on the remote host. Driver 84 copied all 20 exact manifest directories; after confirming the failed tmux handle was absent and no train.json existed, reran the same plan with a distinct raw log. No membership, candidate, tolerance or timing budget changed.

### What I learned
- Fresh dataset selection and source staging are separate dependencies. Compilation from generated programs does not prove the replay source files exist on the measurement machine.

### What was tricky to build
- Preserve old successful evidence and failed raw logs while restarting only a verified terminal pre-measurement failure. The selection hash is embedded in driver 86 before held-out execution.

### What warrants a second pair of eyes
- The baseline selection has no changed executable, so later confirmation cannot be described as transfer of an improved policy. The one unselected held-out scalar intervention must not be timed and used to override selection.

### What should be done in the future
- Finish confirmation and audit the original 200-task reference; use training fusion rejection traces for a subsequent versioned proposal study.

### Code review instructions
- Recompute select_policy.py from train.json; inspect candidate bindings to confirm exact fingerprint aliases and verify the fixed selection hash in script 86.

### Technical details
- Existing global default stays 1.02. Fresh direct study and full PassBench accepted coverage remain distinct. The original reference log's 2,041 success labels are execution labels; the upstream tolerance checker must determine numerical correctness.

## Step 80: Complete confirmation and audit all original reference variants

The fresh study completed with unchanged Kiln selected and all eight confirmation graphs qualified. No compiler improvement is claimed. Independently, exact membership and the original tolerance-one checker were applied to the completed 200-task reference logs, yielding 2,039 numerically accepted variants and 191 complete accepted tasks. These are Inductor reference results, not Kiln coverage.

### Prompt Context
See Steps 78–79, the user's coverage clarification and standing milestone documentation requirements.
**Assistant interpretation:** Finish the registered negative experiment, audit the broader reference evidence, and explain the implications accurately.
**Inferred user intent:** Preserve both successful infrastructure and unsuccessful optimization hypotheses with traceable measurements.
**Commit (selection fixed before confirmation):** b1d6dc8.

### What I did
- Completed and archived heldout.json; added scripts 88–89 to reproduce summary and verify artifact/control identities, selection, exact membership, repeat counts and timing stability.
- Added script 90 to extract training-only opportunity traces for the next proposal study.
- Archived all 200 reference logs and their execution receipt in reference-full-logs.tar.gz, with file hashes and exact expected graph checks in reference-full-audit.json. Script 85 invokes pinned upstream analysis_util rather than reimplementing its numerical criterion.
- Updated the intern guide and roadmap, and prepared the next technical report explaining the conditional policy language, negative selection result and original-reference audit.

### Why
- Execution success is weaker than numerical acceptance. Likewise, an expressive policy language is weaker than evidence that it improves generated code. Both distinctions affect research conclusions.

### What worked
- All eight confirmation graphs passed replay correctness and stable three-repeat timing. Summary selects baseline with exactly 1.0 relative speedup and zero changed selected artifacts.
- Script 89 independently recomputed the study evidence. Selection SHA256 remains 7e8268bacf28b161a4a6c2cb7a7b827f70b556ae68fa39df11b798e367c4235c.
- Reference audit verifies exactly 200 tasks / 2,060 unique variants; 2,039 pass upstream tolerance one, 191 tasks pass every variant. Execution-success labels count 2,041, including two numerical failures.
- Default training traces contain 70 accepted and zero rejected profitability decisions. Ten programs have one kernel, two have two kernels.

### What didn't work
- Staging selection directly into the container-created remote results directory failed: `rsync: [receiver] mkstemp "/home/manuel/passnet-kiln/KILN-005/policy-measurements-v2/.selection.json.3tatRb" failed: Permission denied (13)` and rsync code 23. Saved driver 87 stages identical selection bytes through the existing Docker mount; no broad permission change was needed. Verified the failed confirmation handle was absent before rerunning with a new raw log.
- A report fact-check assertion that every training program had one kernel failed with `AssertionError`. Inspecting all receipts showed ten one-kernel and two two-kernel programs. Corrected the draft before publication and saved the exact histogram/traces in training-opportunities.json.
- Upstream parser labels all 19 execution failures eager_fail, while explicit raw log messages identify 16 eager and three compiled execution failures. Preserved both classifications instead of treating the parser label as causal evidence.

### What I learned
- This training corpus has no rejected profitability decisions for a relaxed policy to reverse. Multi-kernel programs can remain due to matcher or output restrictions even when all observed profitability guards accept.

### What was tricky to build
- Separate observed execution labels, original numerical checker results, raw failure reasons and final timing validity. The original reference run was historically interrupted or overlapped development, so its timing is exploratory despite complete membership.

### What warrants a second pair of eyes
- Confirm exact model separation is not presented as architecture independence; baseline-versus-itself timing is not an optimization result; original Inductor acceptance counts are not Kiln support counts. No hardware-matched reproduction or final full-corpus performance claim is justified.

### What should be done in the future
- Design the next synthesis experiment around training transformation opportunities, with a new declared proposal budget and confirmation boundary. Continue controlled baseline work, original PassAgent reproduction and broader Kiln support separately.

### Code review instructions
- Run scripts 88–90. Extract the saved reference archive and run script 85 with the pinned upstream path. Review report facts against summary.json, training-opportunities.json and reference-full-audit.json.

### Technical details
- The shared summarizer now uses source-neutral scope text instead of incorrectly asserting every future corpus comes from evaluation tasks or every policy is scalar. Historical saved summaries remain intact. Global compiler default remains 1.02; current accepted Kiln PassBench coverage remains five tasks / 73 graphs.

## Step 81: Publish conditional-policy findings and deliver guide Progress 04

Published the technical follow-up as a new Obsidian article and pushed only that note. Delivered the updated intern guide, design 07 and report 08 together as a distinct reMarkable edition. Earlier reports and annotated device documents remain historical artifacts.

### Prompt Context
See the standing user instructions for milestone reports, vault commit/push, detailed diaries and intern-guide delivery.
**Assistant interpretation:** Make the completed negative experiment and reference audit available in the requested reading environments.
**Inferred user intent:** Preserve reviewable research progress and clear scope distinctions.
**Commit (evidence and report):** 042f016.
**Commit (vault):** 929c296.

### What I did
- Added reference report 08 and a matching new vault ARTICLE note, explaining the interpreter, frozen corpus, exact executable aliases, failed optimization hypotheses and original reference audit.
- Updated the intern guide's current checkpoint and roadmap; recorded the milestone with docmgr changelog.
- Uploaded the new guide bundle through remarquee upload bundle without forcing replacement.

### Why
- The negative result explains how policy expressiveness differs from effective optimization; the completed reference audit explains why execution status cannot stand in for numerical correctness.

### What worked
- Vault push: `2383314..929c296 main -> main`.
- Device receipt: `OK: uploaded KILN-005 PassNet Intern Guide Progress 04.pdf -> /ai/2026/10/30/KILN-005`.
- Script 89 recomputed the fresh study evidence; four policy-related Python tests passed after source-neutral summarizer wording changed.

### What didn't work
- Git whitespace review flagged trailing spaces in three raw NVIDIA diagnostic log timestamps. Preserved the original captured bytes intentionally; code/doc whitespace validation had no new failure. No publication or upload failure occurred.

### What I learned
- Training traces identify the immediate limitation more precisely than kernel counts alone: 70 accepted guards and zero rejections explain why relaxed profitability policies do not change these training executables.

### What was tricky to build
- Explain upstream parser phase classifications alongside explicit raw failure messages without inventing a causal diagnosis for every reference failure.

### What warrants a second pair of eyes
- Reports must preserve the difference between original Inductor reference acceptance, direct compiler-policy correctness and modified-protocol Kiln PassBench acceptance. Device receipt proves cloud delivery, not physical synchronization.

### What should be done in the future
- Continue the next synthesis experiment from training opportunities with a prospective confirmation boundary. Full support, controlled performance reproduction and original agent evaluation remain open.

### Code review instructions
- Read report 08, design 07 and guide Section 23; inspect scripts 85 and 89 and their saved audit/facts files. Compare the report body with the new vault note.

### Technical details
- The unrelated untracked root sources directory and unrelated vault changes were not staged. The overall project goal remains active; no completion claim is made.

## Step 82: Generate training-sensitive policies and freeze fresh confirmation

Built deterministic template synthesis over training compiler traces and froze a new adaptive study before timing. Twelve candidates compile across twelve reused development graphs and eight new exact confirmation models. Unlike the previous proposal set, strict scalar and conditional programs change training executables. The shared evaluator remains responsible for all correctness, timing and selection.

### Prompt Context
See the user's standing self-optimization and architectural consolidation instructions, and Steps 78–81 for the preceding negative experiment.
**Assistant interpretation:** Use observed training opportunities to make compiler-policy search effective while preserving a new confirmation boundary.
**Inferred user intent:** Progress toward reusable compiler improvements without proliferating separate evaluator implementations.
**Commit (previous checkpoint):** 2d41d2a.

### What I did
- Added propose_policy.py: fixed 12-program grammar, training-only membership filtering, validated scalar features and quantile cutoffs, provenance and training-trace identity.
- Added tests proving held-out changes cannot affect proposals, incomplete/mislabeled traces are rejected and nonfinite features fail.
- Added stage_corpus.py, replacing repeated manifest-staging code for future studies; preserved historical scripts.
- Strengthened qualify_policies.py to enforce declared policy/compiled policy identity, fixed compiler target, kernel counts and safe fingerprint aliases; added adversarial tests.
- Saved scripts 91–96, froze policy-corpus-v4, staged replay sources and archived all 240 compiled programs plus structural qualification.

### Why
- Relaxed policies cannot improve the earlier training programs by reversing profitability rejection: none occurred. Strict policies can test whether increased kernel count is compensated by reduced repeated arithmetic or resource demand. This is a hypothesis, not a speed claim.

### What worked
- New proposal tests passed; complete integration suite passed 37 tests before four new qualifier tests, and targeted policy suite subsequently passed all 11 tests.
- All 240 combinations compiled. Explicit default matches unchanged. No exact baseline executable alias crosses the split boundary.
- Scalar100/095/090/075 change 1/2/2/4 training programs; disabled changes nine. Conditional large-strict090, small-strict100, high-work-strict095 and single-strict090 change 1/1/1/2; large-strict100 remains a structural alias control.
- Training feature cutoffs: producer median 432128, producer lower quartile 6272, original-work median 32058496. Training-trace SHA256 595e2ee8b1e3947962bcce27626022c4c9fc518689b4c0c0a2bcfc7edb084e69.

### What didn't work
- No new failure in this preparation boundary. A structurally unchanged candidate is retained under the predeclared budget rather than replaced after qualification.

### What I learned
- Selective fusion restrictions provide actual interventions even when relaxation does not. Their profitability remains an empirical question.

### What was tricky to build
- Generate candidates before new confirmation selection, and make held-out records irrelevant to the generator's output and provenance hash. Declare reused training observations explicitly instead of presenting adaptive development as a fresh trial.

### What warrants a second pair of eyes
- The proposal grammar is Codex-authored deterministic synthesis, not a named-model PassAgent run. Fresh exact models can share architecture families. Compiler/reference tests do not establish GPU replay correctness for these variants yet.

### What should be done in the future
- Run registered training evaluation, select only from complete training results, commit selection, then execute only baseline and the selected policy on the new confirmation graphs.

### Code review instructions
- Read propose_policy.py, qualifier adversarial tests, design 07's v4 section and proposals.json. Confirm source hashes, frozen manifest and training sensitivity before assessing any performance claim.

### Technical details
- Frozen v4 membership SHA256 c9d44fa395e7e393552b62ec62d8363c0999be7adf091e22e2911fb8cb6fe115; timing remains 20 warmups, 100 trials, three repeats, IQR fraction <=0.2 and two retries. Default 1.02 and verified PassBench task coverage remain unchanged.

## Step 83: Measure strict interventions and freeze baseline selection

The adaptive training phase measured actual executable changes rather than exclusively aliases. All candidates passed replay correctness and stable timing, but none improved the training aggregate. Baseline wins the registered ranking. This establishes a negative result for selective restrictions on this training population; it does not establish that fusion is globally optimal.

### Prompt Context
See Step 82 and the standing self-optimization/evidence requirements.
**Assistant interpretation:** Evaluate the fixed proposal budget honestly and preserve selection before confirmation.
**Inferred user intent:** Find useful compiler changes while retaining failures and avoiding retrospective selection.
**Commit (frozen adaptive study):** 3490375.

### What I did
- Ran driver 95 on the isolated DGX, completed all 12 training graphs with shared timing for exact aliases, and ran driver 96 using complete training evidence only.
- Archived train.json, selection.json and the raw training log; saved hash-checked confirmation driver 97 and summary driver 98.

### Why
- Structural sensitivity alone is insufficient: a policy must produce faster correct executables across the training objective before it can be selected.

### What worked
- All candidates remained eligible. Baseline/default/unchanged large-strict100 tie exactly at 1.0.
- Changed tree-large-strict090 scores 0.9980242042579816; scalar100 and tree-small-strict100 score 0.9741552077056501; tree-high-work-strict095 scores 0.9728825937649962.
- Scalar095/scalar090/tree-single-strict090 score 0.9279160885936028; scalar075 scores 0.8300711027613213; disabled fusion scores 0.4622390999482331.
- Selection is baseline with heldout_feedback_used=false. Full Python integration boundary passed 41 tests.

### What didn't work
- The generated policy grammar produced no aggregate training improvement. No runtime/test failure occurred; unsuccessful optimization hypotheses remain in the ranking and evidence.

### What I learned
- In this population, reducing fusion generally loses more through additional invocation/intermediate costs than it gains from reduced duplicated work. These measurements do not isolate each cost contribution.

### What was tricky to build
- Keep exact alias candidates tied while comparing truly changed executables under the same correctness, order and timing budget. Candidate code generation was fixed before this feedback.

### What warrants a second pair of eyes
- A ratio of 0.998 for one changed conditional policy is descriptive, not proof of a meaningful regression. Multiple candidates and warm repeated measurements on one GPU limit statistical conclusions.

### What should be done in the future
- Complete fixed confirmation; preserve the negative result, then move the next optimization intervention beyond this restricted fusion grammar. Continue broader compiler integration without presenting this small study as full support.

### Code review instructions
- Recompute rank_training from archived train.json and inspect distinct fingerprints, stable repeat attempts and selection identity before running driver 97.

### Technical details
- Twelve predeclared candidates; 12 reused adaptive training graphs; eight new exact-model confirmation graphs. No confirmation timing entered selection. Global compiler defaults remain unchanged.

## Step 84: Complete the adaptive study without a performance-selected change

The eight newly reserved confirmation graphs all passed correctness and stable timing using the committed selected baseline. Script 99 independently recomputes structural qualification, training ranking, exact membership and timing checks. No held-out performance is used to rescue an unsuccessful training policy.

### Prompt Context
See Steps 82–83 and the standing research-evidence requirements.
**Assistant interpretation:** Finish the declared experiment and retain its negative outcome before changing the intervention or workload pool.
**Inferred user intent:** Maintain a reproducible route to self-optimization that can report unsuccessful hypotheses honestly.
**Commit (fixed training selection):** 6d2f422.

### What I did
- Ran confirmation driver 97; archived heldout.json, summary.json and its raw log.
- Saved verifier 99, preserving checks for policy declarations, target identity, source/artifact hashes, ranking, complete membership and stable repeat evidence.

### Why
- The experiment tests a bounded grammar. A negative result constrains that grammar on this training population; it does not justify removing failures or selecting from held-out feedback.

### What worked
- Eight of eight confirmation executables passed original source replay and stable timing. All 20 graphs across the adaptive study qualified.
- Selected policy baseline, relative ratio exactly 1.0, zero changed selected confirmation executables.
- Selection SHA256 a5a0c1adf17e9da448becc100dffcd3b72f3fe60917517470e04df480b713892 remained fixed.

### What didn't work
- No measured training improvement arose from the fixed 12-program grammar. No confirmation execution failure occurred.

### What I learned
- Strict fusion decisions can change code yet still lose the end-to-end objective. The near-parity changed conditional candidate is not evidence of improvement, and warm repeated measurements do not establish a global optimality claim.

### What was tricky to build
- Keep adaptive training reuse explicit while enforcing a new exact-model confirmation set and preserving older held-out studies as historical observations.

### What warrants a second pair of eyes
- Exact-model disjointness is not architecture-family independence. Baseline-versus-itself ratios provide regression evidence, not transfer of a new compiler policy.

### What should be done in the future
- Move the next intervention beyond this narrow fusion grammar and expand eligible operator coverage so optimization does not repeatedly target the same small workload population.

### Code review instructions
- Run script 99 and compare all ranking entries with train.json; inspect the confirmation candidate list and fixed selection commit before assessing summary claims.

### Technical details
- Corpus v4, artifacts v4, measurements v3. Explicit/default compiler behavior remains unchanged. The direct study adds no accepted PassBench task by itself.

## Step 85: Lower activation semantics, prove narrow ownership cases and verify task 143

Added SiLU and sigmoid import using existing Kiln operations with explicit FP32 arithmetic and output narrowing. Added conservative ownership/use-count checks to functionalize supported in-place ReLU/SiLU on fresh exclusively consumed results. The full import audit increased from 804 graphs / 24 complete tasks to 912 / 36. Actual PassBench task 143 additionally passed all three storage dtypes, increasing accepted coverage to six complete tasks / 76 graphs under the existing modified protocol.

### Prompt Context
See the standing user instructions permitting missing Kiln features, requiring research provenance, retained scripts, detailed design/diary and honest coverage reporting. The next workload expansion follows the unsuccessful adaptive fusion study in Step 84.
**Assistant interpretation:** Expand the real workload population while preserving numerical boundaries and rejecting unsupported mutation semantics.
**Inferred user intent:** Make practical progress beyond the narrow policy grammar without obscuring the distinction between import and verified execution.
**Commit (completed adaptive study):** e6620f4.

### What I did
- Added activation mapping to fx_import.py. Input is widened to FP32 for SiLU/sigmoid and narrowed once at the source operation boundary; later consumers observe the narrowed result.
- Tracked known fresh-producing operations and whole-graph reference counts. In-place activation is functionalized only when its source is fresh and has one total use. Placeholders, views, casts, disabled dropout and observed aliases remain conservative rejections.
- Added positive/negative importer tests and CUDA fixtures for plain activations, a rounded sigmoid consumer and in-place SiLU on a fresh ReLU output. Saved scripts 100–114 and exact artifacts/results.
- Archived official PyTorch 2.9 documentation and v2.9.1 CUDA sources with URL/SHA256/size provenance. Implemented independent mapping to existing Kiln APIs; no PyTorch implementation copied.
- Exported full evaluation task 143, generated its reusable pass and manifest dispatch, compiled all three variants, checked source replay, ran fresh original-evaluator integration processes and scored with original p=0/fpdb=0.1 scorer (id 144).
- Strengthened canonical coverage script 21 to require upstream tolerance-one numerical decisions as well as exact membership, execution success and one replacement per graph.

### Why
- Activation semantics were frequent first blockers despite existing Kiln operator support. Treating compound activation math as low-precision elementary operations would change rounding. Ignoring in-place aliasing would silently change observable source behavior.

### What worked
- All 47 Python integration tests passed. Both sets of nine CUDA dtype/seed comparisons passed, for 18 total comparisons, including saturation values and consumer rounding boundaries.
- Maximum observed activation output errors: FP32 9.5367431640625e-7, FP16 0.0001220703125, BF16 zero. Existing Kiln SiLU is mathematically equivalent but not bitwise identical to PyTorch's native evaluation order.
- Non-in-place activation mapping first reached 853 graphs / 32 complete importable tasks; ownership-based functionalization reached 912 / 36. Exact 200-task / 2,060-variant denominator remains preserved.
- Task 143 matched exactly once per FP32/BF16/FP16 variant and all passed original numerical comparison. Original aggregate task score 0.8399177755920565; this is not a speed improvement relative to eager.
- Stronger numerical coverage accounting retains all prior accepted variants and adds the three new variants: six tasks / 76 graphs. Script 114 binds all facts to artifact hashes, source provenance and exact task evidence.

### What didn't work
- Initial primary-document download through urllib failed with `urllib.error.HTTPError: HTTP Error 403: Forbidden`. Added an explicit user-agent and independent per-source failure records; all four references then downloaded successfully.
- Local tmux launch initially failed with `error connecting to /tmp/tmux-1000/default (Operation not permitted)`. Authorized sandbox escalation accessed the existing socket and launched the audit; no live process was restarted.
- Source staging encountered root-owned generated __pycache__ files: `rsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1356) [sender=3.2.7]`. The initial orchestration shell continued after this error; source files existed from the reference run and errors concerned generated cache files. Fixed the shared stager to exclude __pycache__/ and *.pyc and avoid owner/group preservation. A successful exact three-directory staging retry was verified before accepting the result. Subsequent orchestration uses set -eu.

### What I learned
- A small ownership invariant unlocks many source graphs without pretending to implement general mutation. Whole-graph use counts include output observations and view creation, which must prevent functionalization when aliases remain observable.

### What was tricky to build
- Preserve both the source activation's low-precision rounding boundary and the mutating operation's alias semantics. Known freshness alone is insufficient without sole-use checking; sole-use alone is insufficient for placeholders or views.

### What warrants a second pair of eyes
- Review the fresh-producing whitelist and output/view alias rejection tests. The check is conservative, not full alias analysis. Native PyTorch SiLU uses x/(1+exp(-x)); Kiln uses x*sigmoid(x), so only measured tolerance claims are justified. Import audit still does not establish execution support for all 36 tasks.

### What should be done in the future
- Extend lowering and runtime support for the remaining workload population; investigate interventions beyond the unsuccessful strict-fusion grammar. General mutation/writeback, linear/matmul, normalization, pooling and other unsupported operators remain open.

### Code review instructions
- Start with fx_import.py activation branch/freshness update and test_fx_import.py ownership cases. Run script 114, script 21 and the latest full-denominator summary script 113. Inspect sixth-task-isolated.log for all three replacements and numerical vectors, plus original scorer output.

### Technical details
- No new evaluator protocol was introduced. Task 143 uses kiln-normalized-fx/1 and kiln-dispatch-record-stream/1. GPU remains GB10/NVIDIA PyTorch alpha, with A100 scheduling-cost proxy; paper reproduction limitations remain. Sources and scripts retain both intermediate activation audit checkpoints.

## Step 86: Publish the synthesis/activation report and guide Progress 05

Published a roughly 2,080-word technical report connecting the unsuccessful adaptive policy search to the subsequent activation and ownership work. The new dated Obsidian note is committed and pushed; the guide bundle is delivered as a distinct edition. The report preserves the different denominators for import eligibility and verified PassBench execution.

### Prompt Context
See the standing user requirements for textbook-style milestone reports, vault commit/push, detailed diary and updated intern-guide delivery.
**Assistant interpretation:** Publish the completed experiment and implementation milestone with enough technical detail for independent review.
**Inferred user intent:** Keep durable research explanations alongside code, raw sources, scripts and measured results.
**Commit (compiler/integration milestone):** 09abb7c.
**Commit (vault):** 9f2e915.

### What I did
- Authored report 09 with training-only proposal generation, fixed budget, structural qualification, negative ranking, activation arithmetic, ownership reasoning, exact coverage and reproduction references.
- Related the report through docmgr and updated the ticket changelog.
- Added the exact PyTorch operation-type header and license to the primary-source archive; regenerated provenance and reran source/artifact evidence binding.
- Updated the guide's opening and current Section 24; marked superseded checkpoints as historical to avoid contradictory current counts.
- Created today's vault note under Projects/2026/10/31 without changing historical notes or unrelated user changes.

### Why
- The milestone combines reusable experimental infrastructure with a real extension to source semantics. Neither should be presented as full PassNet reproduction or a new performance win.

### What worked
- Vault push completed `929c296..9f2e915 main -> main`.
- Device receipt: `OK: uploaded KILN-005 PassNet Intern Guide Progress 05.pdf -> /ai/2026/10/31/KILN-005`.
- Source provenance verifies all six archived references, including the Half/BFloat16 -> float operation-type definitions.
- Evidence verifier 114 passes; report facts match six tasks / 76 accepted graphs and 912 graphs / 36 complete importable tasks.

### What didn't work
- No publication/upload failure. Public documentation HTML changed a small amount when refreshed; the new exact hashes are recorded, and prior downloaded bytes remain in commit history. Raw diagnostic-log whitespace is intentionally preserved.

### What I learned
- Reporting structural sensitivity and unsuccessful performance results together makes it possible to distinguish a failed hypothesis from a failed experiment harness.

### What was tricky to build
- Explain fresh storage and whole-graph use counts precisely without claiming general alias analysis or unrestricted PyTorch mutation semantics.

### What warrants a second pair of eyes
- Scope of the fresh-producing whitelist, exact rounding boundaries, the below-eager task score and the distinction between deterministic synthesis and external LLM/PassAgent evaluation.

### What should be done in the future
- Extend qualified linear/matmul and other high-impact source operations; validate compiler support rather than assuming frontend API names imply full PyTorch semantics. Choose the next optimization intervention beyond the exhausted strict-fusion grammar.

### Code review instructions
- Read report 09 and guide Section 24; run verifiers 99 and 114, and inspect the canonical coverage ledger. The new vault report body matches the ticket report body.

### Technical details
- reMarkable receipt proves cloud delivery, not physical synchronization. Unrelated root sources and unrelated vault changes remain unstaged. The overall project remains active and incomplete.

## Step 87: Centralize matrix semantics and preserve source mutation identities

Implemented full positive-static vector/matrix promotion and two-sided batch broadcasting in a shared Kiln matrix module, plus typed FX lowering for linear/matmul/mm/bmm. Added source-derived pass generation to avoid a separate hand-written matcher for each family. During integration, corrected a tracing fidelity issue: Python += could lose its mutation identity before import. The faithful tracer now preserves it and requires ownership or explicit future writeback support.

### Prompt Context
See the standing user instructions to implement missing Kiln pieces, streamline toward compiler optimization, reassess architecture, retain scripts/sources and keep detailed diaries.
**Assistant interpretation:** Extend real matrix workload support with reusable semantic and matching components, while correcting rather than hiding source mutation gaps.
**Inferred user intent:** Increase practical benchmark reach without multiplying one-off adapters or inflating acceptance claims.
**Commit (previous milestone):** 6f2485c.

### What I did
- Added packages/kiln/src/std/matmul.js for shape contracts, independent references and decomposition; removed duplicate/incomplete matrix reference and lowering from tensor.js.
- Added fx_linalg.py and explicit FP32 arithmetic/output narrowing at source boundaries. mm/bmm retain stricter source rank/batch requirements.
- Added MutationProxy/MutationTracer through fx_trace.py and made corpus.translate_graph use it; supported in-place arithmetic functionalizes only fresh single-use producers.
- Added generate_pass.py: trusted source AST extraction, normalized FX deduplication, explicit literal specialization identities, flat output validation and source provenance.
- Saved scripts 115–125, archived official docs/native sources, compiled 42 independent fixtures, ran 126 CUDA comparisons and generated complete task 121's four variants/three match patterns.

### Why
- Existing matrix inference used only the left batch prefix and did not cover general vector/broadcast semantics. Ordinary FX Proxy could erase +=, creating optimistic import eligibility without source mutation support. Automatic matching should preserve source patterns while the compiler owns actual optimization.

### What worked
- All 26 Node test files and 60 Python integration tests passed.
- All 126 CUDA fixture comparisons passed across FP32/FP16/BF16 and seeds 1,7,42, including scalar output, odd K=129, transpose, vectors, broadcasting and bias. Maximum absolute error 7.62939453125e-6; source PyTorch reports float32_matmul_precision=high.
- Matrix import initially reached 1006 graphs / 47 complete tasks. Faithful mutation tracing identifies 22 previously optimistic cases across four unverified task families; authoritative eligibility is 984 / 43. No already verified complete task is among the retractions.
- Task 121 exports four source variants and three reusable generated match patterns, without manual per-family matcher code.

### What didn't work
- First Node import failed with `SyntaxError: Export 'matmulRef' is not defined in module` after moving the reference. Removed the stale unused export; no compatibility shim was added.
- An initial source fixture with 2D input/vector weight/scalar bias failed in PyTorch with `RuntimeError: mat2 must be a matrix, got 1-D tensor`. Pinned Linear.cpp confirms the 2D+bias addmm path. Tested executable vector-weight/no-bias forms separately and retained the discrepancy.
- Pattern validation initially accepted a nested singleton containing a tuple; the test failed with `AssertionError: ValueError not raised`. Added explicit flat-singleton validation before unwrapping.
- Initial iadd pattern extraction failed with `AssertionError: '_operator.iadd' not found` and instead traced `_operator.add`. PyTorch's autowrap scanner ignores names beginning with underscore. Renamed the directly imported alias to public kiln_iadd and verified preserved identity.

### What I learned
- A more faithful importer can correctly lower a numerical count by identifying source effects that were previously erased. Import eligibility should not reward silently functionalizing observable input mutation.

### What was tricky to build
- Right-align both batch prefixes while preserving matrix dimensions and vector promotion/removal. Keep dtype narrowing at operation boundaries, and ensure pass dispatch includes captured literal identity rather than input metadata alone.

### What warrants a second pair of eyes
- In-place source capture and freshness criteria, FP32 arithmetic versus native TF32/accumulation settings, metadata-equal pattern specializations and single-output tuple unwrapping. Raw low-precision nn matrix arithmetic now errors rather than silently returning FP32.

### What should be done in the future
- Run complete real-task matching/numerical/scoring, extend coverage using shared pass generation, and implement proper memory-effect/writeback contracts for the 22 rejected mutation cases. Optimized schedules and original PassAgent evaluation remain open.

### Code review instructions
- Read design 08, matmul.js and fx_linalg.py, then trace/pattern tests. Inspect linalg-cuda.json and all 42 compiled artifacts. Reproduce the faithful full-denominator audit with scripts 121–122 rather than quoting the superseded 1006/47 result.

### Technical details
- No new evaluator protocol was introduced; source-derived in-place addition uses the existing explicit iadd autowrap path. New fixtures/results establish tolerance-based correctness, not performance or full benchmark acceptance. Current verified ledger remains six tasks / 76 graphs pending real-task evaluation.

## Step 88: Correct the nominal numerical audit and isolate two different failures

Real linear evaluation exposed a native BF16 reduction difference, while stronger coverage auditing exposed an older operand-binding bug. Corrected the numerical acceptance gate to t=-5: earlier t=1 checks were explicitly relaxed and should not have been treated as nominal acceptance. All original tolerance-vector logs and scores remain intact. Began canonicalizing source argument roles in shared pass generation to eliminate the legacy binding ambiguity across variants.

### Prompt Context
See the standing reproduction/integrity instructions and the user's earlier coverage clarification. This is investigation of real failures found after Step 87, not a change in the requested objective.
**Assistant interpretation:** Correct the evidence criterion, preserve unsuccessful results and fix source binding without hiding numerical differences or changing evaluator tolerances.
**Inferred user intent:** Establish reliable compiler correctness and reproducible measurements across variants.
**Commit (matrix/tracing implementation):** fae626d.

### What I did
- Preserved the original large-linear standalone failure and ran diagnostic 126 against native, FP32, FP64, staged-bias and reduced-precision-disabled references. Restored diagnostic flags; original benchmark flags stay unchanged in fresh processes.
- Ran the unchanged evaluator on all four linear variants through driver 128. Two BigBird variants fail t=-5 and pass t=-4/-3; two RECT_L variants pass t=-5. This is partial acceptance, not a complete verified task.
- Added script 127 to audit the original reference at -5,-4,-3,1. Changed canonical ledger acceptance to -5 while retaining relaxed diagnostic fields.
- Reproduced legacy rounding-order ambiguity with FP16 values 2048,-2048,0.5. A fixed argument permutation repairs one source grouping and breaks the other. Preserved that failed repair's source/log checkpoint.
- Added canonical first-use argument roles to pattern extraction and optional input permutation to corpus translation. Generated scripts and metadata now share that order; source_input_order records how to bind native source calls for standalone checking.
- Added an end-to-end CPU regression covering both source groupings with identical metadata, one deduplicated pattern/program and exact low-precision results. Preparing a complete canonical rerun of all 30 residual variants.

### Why
- The paper's strict production regime is [-5,-3]. t=1 corresponds to relaxed error tolerance and cannot establish nominal numerical acceptance. Input metadata alone also cannot distinguish graphs with different association of low-precision additions.

### What worked
- Original reference spectrum: t=-5 accepts 1748 graphs / 140 complete tasks; -4 accepts 1855 / 157; -3 accepts 1962 / 172; relaxed +1 remains 2039 / 191. Hardware/software and timing limitations remain unchanged.
- BF16 diagnostic: compiled versus FP64 has zero not-close elements; native with reduced-precision reduction disabled also has zero not-close elements versus compiled. Default native BF16 has 3175 not-close elements. The compiler is more accurate for this particular diagnostic; the published-reference mismatch remains visible.
- Canonical role-order regression passes for both (x+y)+z and (y+z)+x, with source permutations [0,1,2] and [1,2,0], one shared pattern identity and identical compiled source.
- All four linear variants execute and match through the original integration; two qualify nominally. No relaxed tolerance was substituted for the failed strict standalone check.

### What didn't work
- Large BF16 standalone check failed on 3175/52224 elements, maximum error among non-close values 0.375, relative difference up to 151. The subsequent diagnostic's unrestricted maximum difference is 0.5.
- Legacy binding counterexample failed with `AssertionError: Tensor-likes are not equal!`, absolute difference 0.5. A single (y,z,x) repair shifts four failures from one RepVGG grouping to another and is not a valid family-wide fix.
- The new canonical regression initially had `NameError: name 'torch' is not defined`; added the missing test import and reran the complete targeted suite successfully.
- Current strict ledger is temporarily five complete tasks / 74 individually accepted variants, including two in the partial linear task. The pending canonical residual rerun is required before restoring a complete residual-task claim.

### What I learned
- Native reduced-precision GEMM behavior can differ from a more accurate FP32-accumulating compiler. Separately, loose numerical gates can hide real adapter bugs. These causes must be isolated rather than addressed by a global tolerance change.

### What was tricky to build
- Canonicalize pattern placeholder roles and the compiler program ABI together. Reordering only replacement arguments cannot handle different source parameter groupings. Standalone source replay must invert the recorded permutation; generated matcher calls already provide canonical inputs.

### What warrants a second pair of eyes
- The previous relaxed criterion was an audit mistake. Historical reports explicitly naming t=1 remain historical; current numerical acceptance must use -5. Check the new source/canonical input permutations and keep native precision diagnostics separate from original benchmark results.

### What should be done in the future
- Complete canonical residual replay/matching/scoring, audit the current strict ledger, measure the full linear score, and then broaden shared-runner evaluation. General mutation/writeback and remaining compiler operations remain open.

### Code review instructions
- Read scripts 126–131 and the preserved failure sources/logs; inspect reference-numerical-threshold-audit.json and linear-precision-diagnostic.json. Review generate_pass.py canonical order, corpus permutation helpers, check_corpus_cuda.py source binding and the non-associative regression.

### Technical details
- No evaluator numerical threshold or native benchmark precision flag was relaxed. Source mathematical correctness, nominal native-reference acceptance, relaxed curve acceptance and original aggregate score are separate facts. This investigation remains active pending the canonical GPU rerun.


## Step 89: Restore the residual task and distinguish coverage denominators

The completed canonical residual evaluation restores all 30 variants at the nominal numerical threshold. The current ledger now records six complete tasks containing 76 graphs, plus two passing variants of an incomplete linear task: 78 passing graphs in total. The temporary five-task count reflected a real matcher regression under investigation, rather than removed compiler functionality.

### Prompt Context
**User prompt (verbatim):** "didn't we use to have more before?"
**Assistant interpretation:** Reconcile previous and current coverage figures using execution evidence.
**Inferred user intent:** Understand whether progress has regressed or the reporting criteria changed.

### What I did
- Retrieved `fourth-task-canonical-priority-fixed.log` and its receipt from bling.local after the existing evaluation completed.
- Updated script 21 to use that evidence and report `graphs_in_complete_tasks` separately from all individually verified graphs.
- Ran script 21: `Coverage: 6/200 tasks, 78/2060 graphs verified under declared modified protocol.`

### Why
- Import eligibility, successful graph executions, and fully verified task families answer different questions and require separate denominators.

### What worked
- All 30 residual variants satisfy execution, exactly one replacement, and upstream numerical checking at t=-5.
- Six complete tasks are restored; two of four linear variants additionally pass individually.

### What didn't work
- The preceding canonical matcher order allowed a generic three-input pattern to capture a literal-zero specialization, producing `AttributeError: 'int' object has no attribute 'shape'`. That run remains preserved; the completed rerun uses more specific patterns first.

### What I learned
- The previously larger import count was never proof of complete benchmark execution. The current faithful importer admits 984 graphs across 43 complete families; those are candidates for evaluation.
- Earlier t=1 checks were relaxed and must not be described as nominal correctness. Step 88 records the correction to t=-5.

### What was tricky to build
- Canonical placeholder roles must align pattern matching, runtime dispatch, and compiled input order. Specialization priority is a separate requirement from operand canonicalization.

### What warrants a second pair of eyes
- Canonical binding and specificity ordering need review together with the numerical audit; successful process exit alone does not establish correctness.

### What should be done in the future
- Finish the shared batch evaluator and evaluate the newly importable matrix families under the corrected criterion.
- Carry this correction into the next guide and append-only vault report.

### Code review instructions
- Review `integrations/passnet/generate_pass.py`, the saved priority rerun log, and script 21. Rerun script 21 to reproduce coverage.

### Technical details
- Complete-task coverage: 6/200; complete-task graphs: 76/2060; individually verified graphs including partial tasks: 78/2060.
- Protocol remains the declared modified Kiln integration, not an exact reproduction of the paper environment.


## Step 90: Freeze the full newly importable cohort and consolidate its runner

The matrix milestone now has one shared complete-task runner and a separate numerical audit, replacing an expanding sequence of task-specific shell scripts. The cohort is defined by import capability alone: all 14 newly complete task families relative to the activation audit, comprising 151 graph variants. The preliminary estimate of 11/94 omitted three families; script 135 derives the actual set directly from the saved audits.

### Prompt Context
See the user's architectural consolidation, saved-script and detailed-diary instructions recorded earlier, and Step 89 for the latest coverage question.
**Assistant interpretation:** Continue towards measured compiler coverage using reusable orchestration and preserve failures.
**Inferred user intent:** Broaden the experimental basis without obscuring the self-optimization objective or creating one implementation per task.

### What I did
- Added `evaluate_tasks.py` and `summarize_task_run.py` for export/generation/compile/evaluate/score and independent exact-membership acceptance.
- Added script 135 to freeze all newly complete families using saved import audits and source graph-list hashes, and script 136 to launch the run on bling.
- Captured the full Python integration test result in `sources/canonical-binding-python-tests.log`.
- Extended design 08 with canonical argument roles, specificity ordering, the numerical audit correction and the shared runner.

### Why
- A process exit code cannot establish scientific correctness. Separating orchestration from auditing keeps failures and all declared task members visible.
- Hashing compiler/runtime/integration sources before and after every phase prevents silently combining variants from different implementations.

### What worked
- Full Python integration suite: 62 tests passed.
- Plan generation: 14 tasks, 151 graphs; indices 7,27,51,60,74,82,93,118,121,141,157,160,182,185.
- DGX process inspection shows no remaining evaluation container; the previous residual run is terminal.

### What didn't work
- No runner execution result is claimed at this checkpoint. The earlier 11/94 planning estimate was incomplete; the saved derivation replaces it before measurement.

### What I learned
- Source identity, graph membership and acceptance threshold belong in the executable experiment boundary, rather than only in prose.

### What was tricky to build
- Docker export writes into a host-created corpus directory so host Node compilation can create artifacts. Runtime paths use the mounted `/work` directory consistently.
- The audit requires successful execution as well as numerical acceptance and exactly one replacement; absent graphs remain unexecuted failures.

### What warrants a second pair of eyes
- Review frozen source coverage and exact-membership auditing before relying on aggregate results. Timing remains exploratory on the documented different hardware/software stack.

### What should be done in the future
- Run this fixed cohort sequentially; preserve compilation/import failures and diagnose common causes in shared compiler/runtime modules.
- Publish a milestone correction and technical report after measured results exist.

### Code review instructions
- Start with `evaluate_tasks.py`, `summarize_task_run.py`, `matrix-cohort-plan.json` and script 135. Source-derived pattern regressions are in `test_pass_generation.py`.

### Technical details
- Nominal criterion: t=-5, one replacement, successful original evaluation; original scorer p=0, fpdb=0.1 retained independently.
- Frozen cohort membership is derived before this cohort's execution and does not depend on its numerical or timing outcomes.


## Step 91: Publish the matrix milestone and repair scorer input naming

The matrix/binding/numerical-audit report is published as an append-only vault article, committed and pushed as 72db096. Updated guide Progress 06 is uploaded to reMarkable. The complete 14-task cohort is running under its frozen remote source snapshot; scoring failed on completed tasks because the upstream scorer requires a curve named validation. A shared local repair now scores the preserved residual and linear logs successfully, without rerunning their GPU measurements.

### Prompt Context
See the earlier user instructions to publish milestone reports, commit/push the vault, deliver the intern guide and preserve intermediate scripts.
**Assistant interpretation:** Publish the substantive matrix milestone, including the reporting correction and unresolved failures.
**Inferred user intent:** Maintain a technical record that explains implementation and scientific limits, rather than only reporting successes.
**Commit (code):** ce01a6a — canonical binding, nominal audit and initial complete-task runner.

### What I did
- Wrote reference report 10 (about 2,500 words), updated guide Section 25 and corrected current roadmap claims.
- Used docmgr to relate the report to matrix semantics, pattern generation and shared orchestration.
- Saved append-only vault publication script 137 and committed/pushed only the new article; unrelated vault changes remain untouched.
- Uploaded the guide and matrix design as Progress 06 to `/ai/2026/10/31/KILN-005`.
- Added shared `score_task.py` and script 138 for post-run scoring recovery from unchanged log bytes. Script 139 scores the two previously completed GPU logs locally.

### Why
- The original scorer names its curve from the input filename and explicitly accesses validation. Copying the identical bytes under that name repairs orchestration without modifying the evaluator/scorer or consuming another GPU measurement.
- The numerical-audit correction belongs in a new dated article while historical reports remain preserved.

### What worked
- Original scorer: canonical residual task id 12 score 1.068320661082182; incomplete linear task id 122 score 0.5472383608700027. These are aggregate original-curve scores, not nominal task acceptance.
- Vault push: `9f2e915..72db096 main -> main`.
- Delivery: `OK: uploaded KILN-005 PassNet Intern Guide Progress 06.pdf -> /ai/2026/10/31/KILN-005`.
- The cohort's first tasks export, compile and evaluate; remaining work is tracked by run.json and tmux passnet-matrix-cohort.

### What didn't work
- Initial script 136 assumed remote nvm at `/home/manuel/.nvm/nvm.sh`; the exact launch diagnostic was `No such file or directory`. It failed before creating run.json. Remote Node is already `/usr/local/bin/node`, version v26.8.1; the corrected launcher uses that installation. The failed log is preserved.
- Original scorer with benchmark.log raised `KeyError: 'validation'`. Initial score.log and failed phase records are preserved.
- The first reMarkable command used an incorrect design filename and failed before uploading; the command was corrected to the actual saved design file.
- Cohort tasks 51,60,82 have compilation failures. Task 51 and 82 logs include end-to-end check FAILED; task 60 compiled its first variant before a later variant failed. Negative synthetic batch-normalization variance is a suspected shared cause; this is not yet proven or fixed.

### What I learned
- A correct command-line flag set can still violate an undocumented naming dependency in the original evaluator stack. The shared scoring wrapper now makes that requirement explicit.

### What was tricky to build
- The live remote compiler snapshot is kept unchanged. The local scoring repair is not staged remotely until the cohort becomes terminal; otherwise the source-integrity guard would correctly stop it.

### What warrants a second pair of eyes
- Review numerical criteria, exact log copies and original score semantics separately. Higher-precision mathematical agreement does not erase nominal replay failure.

### What should be done in the future
- Wait for the existing cohort, recover its scores from preserved logs, audit all 151 declared variants and investigate common compilation failures.
- Use one shared source-domain mechanism rather than adding ad hoc per-task compiler bypasses.

### Code review instructions
- Review `score_task.py`, scripts 138–139, score receipts and reference report 10. The original scoring implementation is unchanged.

### Technical details
- Scorer configuration: p=0, fpdb=0.1, original sample identity; input and score SHA256 are recorded by the wrapper.
- Publication body matches the ticket report at the publication checkpoint; later cohort results will receive their own dated update.


## Step 92: Audit all 151 variants and prepare a shared reference-domain correction

The first matrix cohort is terminal and fully collected. Ten families reach evaluation; four stop during compilation. Score recovery succeeds on every evaluated family. The strict audit adds two complete tasks and yields cumulative coverage of eight complete tasks and 144 individually passing graphs after accounting for the repeated four-variant linear task. The compile failures are preserved while a separate frozen rerun tests a shared synthetic-input-domain correction.

### Prompt Context
See Step 89 for the coverage question and earlier instructions to implement missing pieces, reassess architecture and retain evidence.
**Assistant interpretation:** Advance measured support without treating import, process exit or relaxed numerical checks as acceptance.
**Inferred user intent:** Reach reusable optimization on a reliable and growing workload population.
**Commit (code):** 40a2371 — milestone publication and verified original-scorer wrapper.

### What I did
- Confirmed run.json status complete, all 14 records present, missing tmux handle and no active evaluation Docker container before staging the score-only helper.
- Ran script 138: all ten evaluated families score successfully; original score failures remain in their original phase receipts/logs.
- Collected the complete 8.3 MB cohort and ran summarize_task_run.py against pinned source membership.
- Extended coverage script 21 to consume explicitly ordered terminal cohorts, retaining old evidence when a family has no new evaluated log.
- Refactored reference-domain inference into shared helpers, reused by source translation and policy-domain export. Configured existing Project.data for established positive variance inputs only.
- Saved scripts 140–141 defining/launching all four compile-blocked families, not a passing subset.

### Why
- The default synthetic reference sampler includes negative values; inference batch normalization requires a valid running-variance domain. The hypothesis must be checked through a new run with ordinary correctness gates enabled.
- One source-derived mechanism is preferable to per-task no-check flags or custom compiler forks.

### What worked
- Independent original cohort audit: 14 tasks /151 graphs; 2 fully accepted tasks, 68 nominally accepted graphs, 63 unexecuted graphs. The remaining 20 evaluated graphs do not qualify.
- Additional complete task indices are 7 and 74. Every original cohort member remains visible in the audit.
- Cumulative ledger: 8/200 tasks, 144/2060 individually accepted graphs; complete tasks contain 84 graphs.
- Full Python integration suite: 65 tests pass, including canonical variance binding and rejection of unsupported sign-domain inference.

### What didn't work
- Compile stops: task 51 first BF16 eca_botnext variant; task 60 later FP16 mixnet variant; task 82 first BF16 RepViT variant; task 182 first FP32 CoAtNet variant. Each failing compiler log reports `end-to-end check FAILED`.
- Task 185 includes an original evaluator eager_fail; other numerical/matching failures remain in the audit. Successful process exit is not acceptance.
- No successful compiler-domain rerun is claimed at this checkpoint.

### What I learned
- Larger import eligibility exposes numerical behavior, source failures and invalid synthetic validation domains as separate obstacles. They need separate evidence and fixes.

### What was tricky to build
- Canonical argument permutations must apply to variance-domain names as well as runtime bindings. The shared helper follows only direct placeholders and supported sign-preserving views/casts.
- Unknown reference domains preserve an explicit diagnostic and ordinary checks without changing mathematical import eligibility. No source-value constants enter generated kernels.

### What warrants a second pair of eyes
- Review the reference-only nature of Project.data and whether source casts preserve the intended variance-domain proof. Review cumulative overlap accounting for task 121.

### What should be done in the future
- Execute the four-family/63-variant rerun and inspect its actual compiler and original-evaluator results.
- Diagnose remaining numerical discrepancies and add broader compiler interventions to the existing training/confirmation framework after qualification.

### Code review instructions
- Start with matrix-cohort-v1-audit.json, the original run receipt, shared reference_domains.py and corpus.translate_graph. Script 140 reproduces the exact rerun membership.

### Technical details
- Original frozen remote source snapshot SHA256: c06547a73b7864bc2e6604bac86f3984f843ece2f36584ed6693af16fbda23f2.
- Reference-only positive transform: abs(value)+0.1; original GPU replay inputs, original scorer p=0/fpdb=0.1 and nominal t=-5 remain unchanged.


## Step 93: Qualify reference-domain results and fix eager sampling before the cost guard

The reference-domain rerun is terminal: six graphs are evaluated, five pass nominally, and 57 remain unexecuted after compiler stops. The cumulative ledger now has eight complete tasks and 149 individually accepted graphs. Diagnostics distinguish sparse BF16 discrepancies from a new eager-allocation regression in the reference setup. Selective sampling fixes the exact heap-aborting program without changing variance samples, numerical tolerances or memory limits.

### Prompt Context
See earlier implementation, architecture consolidation and detailed-diary instructions, plus Step 89 for coverage reporting.
**Assistant interpretation:** Resolve shared infrastructure failures while preserving numerical rejection and complete task denominators.
**Inferred user intent:** Obtain reproducible compiler progress and reliable workloads for subsequent reusable transformation experiments.
**Commit (code):** 2668557 — audited first matrix cohort and shared source-domain setup.

### What I did
- Collected all four follow-up families and independently audited their 63 variants; saved the complete source snapshot and original score for task 82.
- Added script 142 to report finite/unequal values and worst differences from compiler frontend-versus-loop checking.
- Added selective `Project.inputsFor(g,{names})` sampling and used it to initialize variance-only Project.data.
- Added a regression using the actual huge unrelated input shape and a selected 256-element variance; unknown and duplicate names fail.
- Saved script 143 to run the Node boundary and recompile the exact formerly aborting source, plus scripts 144–145 to freeze/launch its complete nine-variant task.

### Why
- The old source-domain setup eagerly sampled every input before endToEnd could apply its existing work estimate. Positive variance needs only small channel vectors; other inputs must retain ordinary allocation order.
- Sparse numerical differences must be investigated independently rather than hidden by this memory repair.

### What worked
- All 26 Node test files pass, including selective sampling of the real 411-million-element input graph without allocating that input.
- Exact formerly aborting task 182 variant 005 compiles normally; the existing end-to-end guard reports its reference would take about 6167M operations and skips it as designed. No no-check flag is used.
- Full Python integration boundary: 65 tests pass.
- Task 82 original score: 0.7087369883771111; five of six variants nominally pass, so it remains incomplete. Cumulative coverage: 8/200 complete tasks and 149/2060 individually passing graphs.

### What didn't work
- Task 51 remaining BF16 check: one bad value of 65536, max absolute difference 0.0001220703125; all values finite.
- Task 60 remaining check: three bad values of 228096, max absolute difference 0.000244140625; its reduced output matches exactly.
- Initial task 182 variant 005 aborts with `FATAL ERROR: invalid array length Allocation failed - JavaScript heap out of memory`, after roughly 2.4 GB heap use. Shape [512,256,56,56] contains 411041792 elements. The failing run remains intact.
- A complete nine-variant original evaluator result is not yet established by the focused compilation probe.

### What I learned
- Reference-data setup must respect the same cost guard as reference evaluation. An otherwise legitimate domain correction can allocate enormous tensors before the guard if it samples all inputs eagerly.

### What was tricky to build
- Sampling only named graph inputs preserves the original deterministic random values and dtype rounding for variance. Replacing those values with a different hand-written sampler would have changed the failing numerical cases.
- Partial Project.data lets ordinary checks sample remaining inputs only if they actually run. The new selector is a general project API, not a per-task compiler override.

### What warrants a second pair of eyes
- Review selected-name validation, unchanged sampling semantics and the caller allocation boundary. Review BF16 discrepancies in conjunction with fused arithmetic/storage boundaries and the compiler check's fixed tolerance policy.

### What should be done in the future
- Run all nine variants of task 182 under the original evaluation protocol and audit them.
- Investigate sparse compiler-reference differences without relaxing original benchmark acceptance; broaden the transformation intervention once a useful workload population is qualified.

### Code review instructions
- Start with Project.inputsFor, project-input-dtypes.mjs, attach_reference_data, the two numerical diagnostics and selective-reference-validation.log. Script 143 reproduces the exact memory recovery.

### Technical details
- Follow-up remote source snapshot: e8c0bcac34160dcd1d6437c73de248803127eebaf2809af88fbbe0f50c73a307.
- The new full-task plan preserves graph-list identity and all nine variants; it changes allocation order only.


## Step 94: Correct FP32 loop-reference semantics and isolate FMA rounding

The complete selective-input rerun preserves the memory recovery but stops on a later BF16 reference mismatch. Investigation identifies two different numerical issues: a proven shared double-precision loop-reference bug and explicit FMA contraction changing rounding. The former is corrected and validated against actual CUDA; the latter is isolated without changing global defaults or benchmark criteria.

### Prompt Context
See prior user instructions to implement missing compiler pieces, document provenance and reassess architecture, and Step 89 for coverage accuracy.
**Assistant interpretation:** Fix a shared compiler correctness model rather than add per-task exceptions or relax acceptance.
**Inferred user intent:** Build a reliable base for reusable compiler optimization.
**Commit (code):** bcdaa75 — selective reference sampling and exact memory recovery.

### What I did
- Collected the terminal nine-variant selective-reference run; seven variants compile, variant 007 fails, and all nine remain unexecuted in the original evaluator.
- Saved script 146 for a one-element FP32 cancellation oracle, script 147 for core/exact-real-case validation, scripts 148–150 for actual CUDA verification and script 151 to isolate explicit FMA contraction.
- Added shared FLOAT32_FUNCTIONS/FLOAT32_REDUCERS for full serial and sampled point loop references. Rounded literal evaluation/constant-fold inputs while preserving literal storage.
- Added f32-loop-reference.mjs covering scalar cancellation, literal folding, accumulator precision and agreement between full/point evaluation.

### Why
- The frontend stores intermediate tensor results in Float32Array, while the old serial loop keeps JavaScript doubles. This is observably different from the intended scalar register model and from actual CUDA.
- Removing FMA globally would silently choose a numerical/performance policy. Its observed rounding effect needs a separate contract and experiment.

### What worked
- Exact oracle: frontend zero, old loop one; corrected loop zero; actual GB10 CUDA zero, exact equality with native PyTorch.
- All 27 Node test files pass, including existing kernel-identity checks.
- Preserved task 51/003 now passes ordinary compiler checking (maxAbs 0.0000152587890625); task 60/019 also passes (maxAbs 0.00006103515625 on its large output, reduced output exact).
- FMA isolation: task 182/007 has eight bad values of 802816 with contraction; removing only contract_fma gives zero absolute difference on every output.

### What didn't work
- Initial implementation rounded E.num storage eagerly, changing blur/layernorm emitted identities. Full validation failed in the view test: `FAIL blur identities unchanged` and `FAIL layernorm identities unchanged`. The initial log is preserved; the fix was narrowed to evaluation/folding rather than updating expected identities.
- Corrected FP32 evaluation alone does not resolve task 182/007: eight bad values, maxAbs 0.00048828125. No original task acceptance is claimed for the diagnostic.
- The complete selective-reference task remains compile-blocked, with all nine original evaluations unexecuted.

### What I learned
- A compiler validator can reject a GPU-correct program because its own scalar precision is wrong. Separately, FMA can be GPU-valid yet differ from a frontend sequence with two rounding boundaries.

### What was tricky to build
- Serial and sampled references must share FP32 scalar/accumulator semantics. Rounding only final output or only scalar operations leaves a reduction or sampled-reference inconsistency.
- Stored literal representation affects kernel identity; evaluation precision can be corrected without unnecessary identity churn.

### What warrants a second pair of eyes
- Review FP32 accumulation and constant folding, compound operation references, signed zero/nonfinite behavior and the distinction between explicit contraction and CUDA compiler contraction. The JS FMA model is still a host approximation of device FMA/transcendentals, not a full bit-exact GPU implementation.

### What should be done in the future
- Establish explicit source/IR/CUDA numerical contracts and qualify a contraction policy without weakening official acceptance.
- Reuse the existing training/confirmation framework to evaluate broader legal compiler interventions; do not repeatedly rerun the same blocked task without a corresponding implementation change.

### Code review instructions
- Start with std/fns.js, compileSerial/compilePoint, f32-loop-reference.mjs and sources/{loop-precision-counterexample.json,f32-loop-reference-validation-v2.log,f32-cancellation-cuda.json,fma-contraction-diagnostic.jsonl}.

### Technical details
- CUDA oracle output dtype BF16, input FP32, exact expected/actual zero. PyTorch 2.12.0a0+5aff3928d8.nv26.05 on NVIDIA GB10.
- Cumulative coverage stays at eight complete tasks and 149 individually accepted graphs. No running evaluation job remains at this checkpoint.


## Step 95: Add a numerical contraction policy encoded in scalar IR

The contraction investigation now has an opt-in compiler implementation rather than a rule-removal workaround. Separate-rounding mode introduces protected scalar functions whose CUDA intrinsics retain operation boundaries under unchanged NVRTC defaults. Exact CPU and CUDA oracles distinguish the two modes, while default identities remain unchanged. The complete four-family/63-variant development rerun is frozen before measuring this policy on real tasks.

### Prompt Context
See earlier instructions to implement missing Kiln pieces, retain research provenance, reassess architecture and progress towards reusable self-optimization.
**Assistant interpretation:** Define and enforce a compiler numerical policy without changing benchmark correctness criteria.
**Inferred user intent:** Establish legal arithmetic choices so future agents optimize implementations rather than exploit numerical ambiguity.
**Commit (code):** ed8bea9 — FP32 loop-reference correction and explicit-contraction diagnosis.

### What I did
- Archived primary NVIDIA Math API/NVRTC 13.1.1 documentation and PyTorch v2.9.1 CUDA normalization sources with URLs, sizes and SHA256 provenance using script 152.
- Added add_rn/sub_rn/mul_rn scalar functions and a pre-optimization separate-rounding pass; default pipeline remains contraction allow.
- Added the contraction option to the standard pipeline, workbench compiler, export CLI, corpus compiler and shared complete-task runner. Explicit policy provenance is recorded in artifact source metadata and phase commands.
- Generalized the WGSL unavailable-reason helper to reject unsupported scalar guarantees as well as unsupported storage; no compatibility alias was added.
- Added core contraction tests and scripts 153–156 for exact CPU/CUDA validation. Saved script 157 to freeze all 63 members of the four earlier failed families and script 158 to launch them.
- Wrote design 09 and related the primary implementation/test files through docmgr.

### Why
- Removing an IR FMA rule alone does not prevent CUDA from contracting ordinary multiplication and addition. Protected per-operation intrinsics carry the requirement in executable code and its existing identity, without a separate launcher flag/cache policy.
- The contract covers elementary add/subtract/multiply boundaries. It does not promise native cuBLAS/normalization/transcendental implementation equivalence or undo explicit source FMA.

### What worked
- All 28 core Node test files pass, including unchanged default identities, explicit/default allow equivalence, literal precision and protected CUDA emission.
- All 65 Python integration tests pass.
- Exact CUDA oracle on NVIDIA GB10: a=1+2^-23, b=1-2^-23, c=-1; allow returns -1.4210854715202004e-14 (-2^-46), separate returns zero, native separate PyTorch returns zero. Both outputs match their exact declared expectation.
- The exact preserved CoAtNet 007 source compiles with ordinary end-to-end checking under contraction separate.

### What didn't work
- No complete-task evaluation result is claimed at this checkpoint. The earlier failures remain authoritative until the new run qualifies its members.
- No WGSL implementation of the protected-operation guarantee is supplied; export emits a clear unavailable reason instead of weaker arithmetic.

### What I learned
- A numerical policy can be expressed using ordinary compiler pass composition and scalar function semantics. Runtime global flags are unnecessary for this bounded guarantee.
- Source metadata should record policy provenance, while actual code identities determine executable aliases; metadata-only differences must not manufacture optimization evidence.

### What was tricky to build
- The protection pass runs after decomposition but before FMA optimization, covering canonical and alias arithmetic names. Scalar JS functions round operands as well as outputs so constant folding respects FP32 inputs.
- Protected function names participate in existing loop/kernel identities and CUDA source. Explicit source FMA remains available, and default pipeline/WGSL behavior remains unchanged for ordinary programs.

### What warrants a second pair of eyes
- Review guarantees at compound source operators and reductions, and the potential loss of scheduling patterns that expect ordinary multiplication. Separate elementary rounding does not establish native operator bit-equivalence.

### What should be done in the future
- Run the frozen four-family cohort with original matching, replay and scoring and preserve all 63 outcomes.
- Hold the numerical contract fixed while broadening reusable fusion/scheduling interventions; only recover contraction where justified by source permissions or semantic facts.

### Code review instructions
- Start with design 09, contraction.mjs, std/fns.js, std/tensor.js and std/emmy.js, then CLI and runner propagation. The exact GPU receipt is contraction-cuda.json.

### Technical details
- Public configuration: std.emmy.pipeline({contraction:"separate"}); CLI --contraction separate; alternative allow preserves existing defaults.
- CUDA implementation: __fadd_rn, __fsub_rn, __fmul_rn; no NVRTC flag changes. Scientific acceptance still requires original t=-5 and original scorer p=0/fpdb=0.1.


## Step 96: Qualify 62 of 63 variants and audit the actual measured source snapshot

The complete separate-rounding cohort passes all compilation, evaluator and scoring phases. It accepts 62 of 63 variants at nominal t=-5 and adds three complete tasks. Cumulative development coverage becomes eleven complete tasks and 206 individually passing graphs after overlap accounting. A separate structural audit proves the previous training set has no reductions, fanout or duplicate internal kernels, motivating a richer next optimization population rather than another unsupported transformation hypothesis.

### Prompt Context
See the earlier coverage question in Step 89 and instructions to document provenance, consolidate architecture and streamline towards self-optimization.
**Assistant interpretation:** Complete the numerical-policy qualification and use evidence to choose the next optimization experiment.
**Inferred user intent:** Obtain reliable compiler progress and a meaningful population for reusable transformation learning.
**Commit (code):** a620e6e — opt-in separate FP32 rounding through scalar IR and CUDA.

### What I did
- Confirmed terminal run.json status complete, all four process_complete task records, no evaluation container and missing tmux handle before collecting the complete cohort.
- Audited exact membership, matching, successful execution, numerical decisions and original scores for all 63 variants.
- Updated coverage script 21 to include the latest cohort, derive active protocol markers from logs and retain per-cohort numerical/source configuration. The ledger explicitly describes cumulative multi-version evidence.
- Saved scripts 159–160 for local compiler dependency setup and training-only structural analysis. Local Node 26.13.0 uses the already installed Acorn 8.19.0 bytes from bling and workspace links; tracked dependency declarations are unchanged.
- Added script 161 to bind metric/oracle facts and source provenance, and script 162 to archive known remote leftovers and align future runtime sources.
- Updated guide Section 29, roadmap and design 09, and wrote report 11 (about 2,200 words).

### Why
- The exact previously failed families must retain every member, including the remaining BF16 failure. Compiler policy qualification is not an untouched confirmation speedup claim.
- New transformations need actual workload opportunities. The old training set cannot evaluate reduction scheduling, selective fanout fusion or exact duplicate elimination.

### What worked
- Nominal per-task results: task 51 4/4, task 60 44/44, task 82 5/6, task 182 9/9. Every one of the 63 variants executes and scores.
- Original scores: 0.8761321161670029, 0.8872184055108473, 0.7079148131970212 and 1.9642242385057964 respectively. These integrate the original numerical curve and are separate from nominal counts or speedup relative to unchanged Kiln.
- Cumulative ledger: 11/200 complete tasks, 206/2060 passing individual graphs; complete tasks contain 141 graphs.
- Training structural analysis: twelve prior training graphs, fourteen fused kernels or ninety unfused kernels, zero reductions, zero multi-consumer kernels and zero exact internal duplicate kernels in either configuration.
- All measured snapshot files are reconstructible. Eighty-five of 89 match a620e6e; four exact archived overrides cover the rest. Executed CUDA/shared-runtime ASTs match the commit after excluding WebGPU and documentation. Future aligned snapshot has 87/87 matching source files.

### What didn't work
- One BF16 RepViT variant remains unaccepted at t=-5 and passes only relaxed points. No filter or tolerance change hides it.
- Initial exact-revision audit failed with four paths: check_fourth_task_cuda.py, test_dispatch_policy_gpu.py, runtime/python/kiln_launch.py and its test. The failure log is preserved. Two are inactive old diagnostic leftovers; the runtime differs in a WebGPU guard/docstring. The measured snapshot is described as commit plus archived overrides, not a clean checkout.
- Structural analysis found no evidence supporting CSE or fanout/reduction algorithms on the prior twelve training graphs. No such pass was implemented merely to create an experiment.

### What I learned
- A measured source snapshot should be checked against the claimed revision, not only hashed. Reconstructible overrides are preferable to a false clean-revision claim.
- The old workload population itself restricts optimization opportunity; a different grammar alone cannot fix absent graph structure.

### What was tricky to build
- The 63-graph result includes five already passing task-82 variants, so only 57 are new cumulative successes.
- Protocol activation differs across tasks; extracting markers avoids omitting multi-output/autowrap extensions from newly generated passes.
- Remote cleanup was reversible and occurred only after the run was terminal. The earlier measured bytes remain archived and hash-verified; future runtime alignment does not rewrite historical evidence.

### What warrants a second pair of eyes
- Review the AST comparison's precise exclusion of WebGPU/docstrings, the four archived source overrides, and mixed-version coverage interpretation. Review corpus richness before the next optimization study.

### What should be done in the future
- Freeze a new official-training-source corpus containing reductions and matrix operations, with fixed numerical policy and fresh exact-model confirmation.
- Demonstrate changed training implementations before performance selection. Original PassAgent and full 200-task support remain open.

### Code review instructions
- Reproduce script 161 and inspect contraction-verified-facts.json, separate-rounding-cohort-v1-audit.json, training-loop-opportunities.json and the updated coverage script.

### Technical details
- Measured snapshot SHA256 a30e6315edbe82dade9f7cacc80fde08f0653dcb0e512d8aedc512a520a7d655; original nominal criterion t=-5 and original score p=0/fpdb=0.1.
- No evaluation job remains running at this checkpoint. The detailed report distinguishes qualification, mathematical oracles, cumulative support and future optimization research.


## Step 97: Publish the numerical-contract milestone and preserve the first rich-selection failure

Report 11 is published append-only to the vault, committed/pushed as c9d8b43, and guide Progress 07 is uploaded to reMarkable. The next structural selection attempt retains its declared strong model exclusions and resource envelope but cannot fill the reduction quota. Its partial sources, audit checkpoint and failure log are preserved rather than renamed as a completed study.

### Prompt Context
See the earlier user instructions to publish textbook milestone reports, commit/push the vault and retain diary/scripts/source material.
**Assistant interpretation:** Complete the measured milestone delivery and make the next experiment depend on real structural opportunity.
**Inferred user intent:** Maintain reproducible technical reports and avoid optimization studies with no reachable useful transformation.
**Commit (code):** 20db6e2 — eleven-task evidence and source-snapshot reconstruction.

### What I did
- Published the approximately 2200-word report through saved script 163 and committed only the new vault note, preserving unrelated vault changes.
- Uploaded guide/design 09/report 11 as Progress 07; related the report's primary source and evidence files with docmgr.
- Added a general metadata/resource selector and fixed six-train/four-confirmation quotas per reduction/matrix category.
- Attempted the declared 4096-task scan with all evaluation/prior-study exact models excluded.

### Why
- The earlier training population has no reductions, fanout or internal duplicate kernels. New policies need a richer workload distribution.
- Failed eligibility scans are research evidence and cannot be silently replaced by a passing-subset claim.

### What worked
- Vault: c9d8b43 pushed, `72db096..c9d8b43 main -> main`.
- Delivery: `OK: uploaded KILN-005 PassNet Intern Guide Progress 07.pdf -> /ai/2026/10/31/KILN-005`.
- Source-model/split isolation and metadata-only selection tests pass.

### What didn't work
- The first selector exhausts its bound with ten matrix and only two reduction sources; it raises `Selection incomplete; preserve partial audit`.
- Its last saved checkpoint covers 4065 tasks and includes 115 unsupported functional LayerNorm attempts. The initial selector did not flush the final partial interval on failure; the next implementation repairs that audit boundary.
- The captured selector-after-failure.py includes the repair and is explicitly not claimed as the byte-identical originally executed selector.

### What I learned
- The missing LayerNorm import blocks a useful reduction population. Relaxing model exclusions or claiming another flat workload study would not address it.

### What was tricky to build
- Selection must distinguish source eligibility from actual IR opportunity and from measurement. Partial output has no completed manifest and is not added to training results.

### What warrants a second pair of eyes
- Review the declared eligibility envelope, exclusion population and honest labeling of the incomplete attempt.

### What should be done in the future
- Add LayerNorm using existing compiler primitives, qualify it, retry the same declared selection in a new directory and inspect training IR only.

### Code review instructions
- Start with prepare_study.py, rich-study-selection-v5.json and the preserved policy-corpus-v5 failure artifacts.

### Technical details
- No GPU candidate or confirmation timing was collected during this failed attempt. The original report's scope remains numerical qualification, not a claimed self-optimization speedup.

## Step 98: Reuse existing LayerNorm lowering and qualify a richer source corpus

Functional LayerNorm now lowers through existing N.layer_norm after validating and flattening normalized trailing dimensions. All 126 independent CUDA comparisons pass. The unchanged selection envelope then fills twenty sources, with balanced training/confirmation quotas and explicit source/importer hashes. The full import audit increases eligibility to 1029 graphs/51 complete families without changing original accepted task counts.

### Prompt Context
See prior instructions to implement needed Kiln components, document provenance and consolidate architecture.
**Assistant interpretation:** Add the missing source semantics that directly unlock a meaningful optimization population.
**Inferred user intent:** Progress towards reusable compiler improvement without duplicating existing compiler algorithms.

### What I did
- Added fx_norm_ops.py for functional/torch/ATen LayerNorm binding, static normalized-shape checks, optional affine identities, FP32 opmath and output restoration.
- Reused existing N.layer_norm with [rows,width] input and flattened affine vectors; no new normalization implementation was ported.
- Archived official PyTorch API definitions/docstrings, native v2.9.1 source and license with URL/SHA256 provenance in sources/pytorch/layer-norm.
- Saved scripts 165–171 for acquisition, 21 fixture exports/compilation, 126 CUDA comparisons, full import audit and a new-directory selection retry.
- Added source-model exclusion, split independence, resource-bound and durable failure-audit tests. Extended corpus metadata with generated tensor-variable shapes for matrix work bounds.

### Why
- Flattening the validated normalized suffix implements multidimensional semantics with the existing reduction primitive and avoids an architectural fork.
- The retry retains the original salt, quotas, model exclusions and volume bounds; only the missing source operation is added.

### What worked
- All 21 fixture artifacts compile with ordinary checking and separate rounding; all 126 CUDA comparisons pass across seven forms, three dtypes, three seeds and random/constant inputs, with unchanged input checks.
- Maximum absolute errors: FP32 4.76837158203125e-7; FP16 0.00048828125; BF16 zero.
- Full import audit: 1029/2060 graphs, 51/200 complete eligible families. These are import counts only; original replay acceptance remains 11/206.
- Successful source selection after 888 tasks: six reduction and six matrix training graphs, plus four of each for confirmation. Membership f3df1ddadef41f31d9b88ab9953c7c7a2a6cd3bffa75bb830159205b40848ad0.
- Training-only IR has 34 fused kernels, 18 reductions and 11 multi-consumer kernels; unfused has 215 kernels, 18 reductions and 13 multi-consumer kernels. No exact internal duplicates are found.

### What didn't work
- Direct official documentation downloads returned `HTTP Error 403: Forbidden`. Retrieval failures are recorded; official pinned Python API docstrings/native sources were archived instead, and documentation pages were read through the web tool.
- The first negative unit fixture modified encoded kwargs at the wrong nesting level, producing an unsupported-encoding error. The fixture was corrected; implementation semantics were not changed to satisfy that error.
- Mixed affine precision and native tuple-statistic outputs remain explicitly unsupported. Original PassBench matching/acceptance for the new operator has not been established by fixtures.

### What I learned
- Compound frontend operators must count as reduction structure in eligibility even if generated source contains no literal N.sum. Actual training IR confirms the expected structures.

### What was tricky to build
- Optional affine parameters need shape-correct identities, normalized suffixes must match exactly, and casts must preserve source operation boundaries. Selection source/importer hashes are checked before and after scanning.

### What warrants a second pair of eyes
- Review flattening order, dtype/affine restrictions, and whether the declared source population supports the intended generalization claims. Exact-model exclusions do not imply unrelated architectures.

### What should be done in the future
- Use the richer fixed corpus for reusable-policy learning and evaluate newly imported benchmark tasks separately from fixture/source eligibility.

### Code review instructions
- Start with fx_norm_ops.py, test_fx_norm_ops.py, layernorm-cuda.json, the two rich-selection attempts and rich-training-loop-opportunities.json.

### Technical details
- No native normalization code copied. CUDA fixtures use the existing bridge and fixed contraction separate; source reference/runtime inputs and numerical tolerances retain their declared behavior.

## Step 99: Freeze balanced reusable policies from training evidence

Unchanged/default controls compile on all twelve training sources and have identical executable fingerprints. Their trace now contains genuine profitability rejections near the default boundary. Twelve reusable scalar/conditional programs and the full measurement procedure are frozen before confirmation IR compilation or new GPU timing. Qualification now requires explicit numerical/scope receipts, and the compiler driver verifies committed sources and frozen declarations around every candidate.

### Prompt Context
See the user's request to streamline towards self-optimization, together with provenance, diary and commit instructions.
**Assistant interpretation:** Move from structural qualification to an actual new training-selection/confirmation experiment.
**Inferred user intent:** Learn reusable compiler decisions on workloads that can exercise them, without treating a configured harness as an optimization result.

### What I did
- Added training-only compilation scope and a fixed corpus numerical contract to compile_policy.mjs. Restricted reference sampling to constrained defaults, preserving explicit data and avoiding repeated positive-domain transforms.
- Added propose_rich with unchanged/default controls, seven scalar policies and three bounded conditional programs. Candidate generation ignores confirmation records and has a regression test for poisoned held-out traces.
- Saved scripts 172–174 for training controls, candidate/procedure freeze and complete source-verified compilation.
- Introduced kiln-policy-compilation/2 receipts with explicit phase/numerical policy; full qualification rejects training-only scope or mismatched numerical contracts. Old receipts remain tied to their pinned implementation revisions rather than adapted.
- Expanded source snapshots to include package TypeScript and integration MJS. GPU measurement records native numerical flags without modifying them.
- Added design 10, updated guide Section 30/roadmap, and added task mg15 for the complete rich-corpus study.

### Why
- Training has 260 attempted decisions: 181 accepted and 79 rejected, including twenty modest work increases around 1.0264–1.1424. The fixed grammar tests both restrictions and relaxations on actual opportunities.
- Numerical configuration must agree between plan, corpus, receipt and executable provenance; it cannot become a candidate-dependent correctness relaxation.

### What worked
- Twelve training controls compile; explicit default equals unchanged under contraction separate. No confirmation IR is compiled during this stage.
- Twelve programs are frozen with training cutoffs producerElements=2048 and originalWork=1694208. The candidate-freeze file binds source membership, policies, reference domains and measurement plan.
- Full Python integration tests pass at the declaration boundary, including scope/numerical mismatch rejection and confirmation-independent generation.

### What didn't work
- No GPU policy timing, selected compiler improvement or confirmation result is claimed at this checkpoint. Complete artifact qualification and measurement are still required.
- The grammar is authored by the current Codex session from training evidence, not an external PassAgent invocation. It changes existing fusion profitability and does not claim a novel graph mutation.

### What I learned
- Richer data exposes real choices before introducing a more complex compiler algorithm. Compiler traces can distinguish an absent opportunity from an unprofitable candidate.

### What was tricky to build
- Baseline/default control JSON remains immutable while later proposals are frozen. Training-scope receipts cannot accidentally pass a full-corpus gate.
- The fixed contract is carried through the standard pipeline and artifact source provenance while executable aliases ignore metadata-only differences.

### What warrants a second pair of eyes
- Review source exclusion/split independence, freeze hashes, default equivalence and unchanged original-replay correctness. Treat exact source aliases as shared evidence and report any confirmation failures.

### What should be done in the future
- Compile/qualify every declared policy, measure training only, commit one selection, then time only baseline and the selected policy on the eight confirmation sources.

### Code review instructions
- Start with design 10, proposals.json/measurement-plan.json/candidate-freeze.json, compile_policy.mjs, qualify_policies.py and measure_policy.py. Script 174 enforces the committed-source/declaration boundary.

### Technical details
- Budget: 20 warmups, 100 trials, three repeats, IQR/median <=0.2, at most two retries; seed 42. Selection is family-balanced geometric mean synchronized end-to-end ratio with baseline-first exact ties and compile-cost coefficient zero.
- Confirmation models remain uncompiled until the candidate/procedure freeze. The complete project scope, including original PassAgent and all 200-task support, remains open.

## Step 100: Qualify the rich artifacts and preserve a native-reference failure

All 240 artifacts compile from committed b4a4102 sources and pass structural qualification. Training then completes on all twelve declared graphs, but unchanged Kiln fails comparison on two matrix graphs. Selection correctly refuses the run. Diagnostic contrasts establish that these disagreements come from native TF32-enabled matrix precision, rather than an inaccurate Kiln result. No confirmation timing has occurred.

A separate v5-r2 declaration retains every source and candidate and explicitly configures the research reference to full-precision FP32. This is a modified compiler-policy experiment, not a repaired native PassBench result. It reuses the exact qualified binaries and keeps the failed native run intact.

### Prompt Context
See Step 99 for the self-optimization request. The user additionally asked, verbatim: "didn't we use to have more before?" The response distinguished import eligibility from verified execution and explained prior retractions.
**Assistant interpretation:** Continue the frozen study while preserving numerical and reporting distinctions.
**Inferred user intent:** Reach reusable optimization results backed by trustworthy evidence.
**Commit (code):** b4a4102 — feat(passnet): qualify LayerNorm and freeze a structurally rich policy study.

### What I did
- Executed script 174: twelve policies times twenty sources, all successful; default equals unchanged, no cross-split baseline executable aliases.
- Saved staging/training/diagnostic scripts 175–177 and raw training, compilation and FP64 contrast evidence.
- Ran select_policy.py on completed training; it refuses baseline correctness failures, leaving no selection.json.
- Froze v5-r2 with scripts 178–180: unchanged membership/candidates/binaries, explicit highest-precision native reference and wrapper hash checked before execution.

### Why
- Two matrix references use reduced precision in the actual container. Changing or filtering their results inside v5-r1 would invalidate its frozen protocol.
- A separately declared full-precision reference tests the compiler-policy question against FP32 semantics while retaining the unresolved native benchmark limitation.

### What worked
- All 240 compilations and structural qualification pass. The native run completes all twelve training records; ten baselines qualify.
- Pegasus: compiled versus FP64 maximum absolute error 2.192114911814258e-8, versus highest-precision PyTorch 2.9802322387695312e-8. Opus: corresponding maxima 1.5018985360937265e-8 and 3.725290298461914e-8.
- Original backend settings are recorded: float32 precision high, matmul TF32 allowed. Full-precision diagnostic settings are restored after each contrast.

### What didn't work
- Native Pegasus comparison: 4921/10240 mismatches, maximum absolute difference 7.242336869239807e-5.
- Native Opus comparison: 6893/25088 mismatches, maximum absolute difference 3.949180245399475e-5.
- Selection raises `ValueError: Unchanged compiler baseline is not qualified`. The complete traceback is archived in policy-measurements-v5-r1/selection-attempt.log.
- No original PassBench acceptance or optimization gain follows from these diagnostics.

### What I learned
- An accurate FP32 implementation can disagree with a reduced-precision native reference under tight elementwise tolerances. Recording the reference backend flags makes that distinction testable.

### What was tricky to build
- The modified reference must remain an explicit execution wrapper and frozen plan rather than an implicit compiler or benchmark change. Candidate generation stays unchanged despite observed training failures.

### What warrants a second pair of eyes
- Review the protocol-change label, unchanged source membership/candidate hashes, untouched native evidence and the distinction between FP32 research correctness and native PassBench compatibility.

### What should be done in the future
- Run the declared v5-r2 training procedure, commit a training-only selection if qualified, then measure baseline and selected policy on all eight confirmation graphs. Resolve native benchmark compatibility separately.

### Code review instructions
- Read rich-matrix-numerics.json, policy-measurements-v5-r1/train.json and selection-attempt.log, followed by scripts 178–180 and both candidate-freeze files.

### Technical details
- Source/artifact compilation revision b4a4102; membership f3df1ddadef41f31d9b88ab9953c7c7a2a6cd3bffa75bb830159205b40848ad0. Fixed contraction separate; existing correctness tolerances and 20/100/3 timing budget unchanged. Native TF32 precision remains untouched in the original evaluator.

## Step 101: Commit training-only selection before confirmation timing

The explicitly modified FP32 research run completes all twelve training graphs with every candidate qualified. The frozen objective selects scalar105 with family-balanced end-to-end ratio 1.0013193438356627. This tiny observed training difference is insufficient to claim a reliable compiler improvement; confirmation remains necessary. Remote source verification exactly matches the compilation snapshot, with no changed, missing or additional files.

### Prompt Context
See Steps 99–100 for the self-optimization request and the explicitly separated reference protocols.
**Assistant interpretation:** Complete the declared selection/confirmation sequence without adapting to confirmation results.
**Inferred user intent:** Establish measured, generalizable compiler-policy evidence.

### What I did
- Ran the committed script 179 full-precision wrapper on bling and archived completed training and its driver log.
- Used unmodified select_policy.py to choose scalar105 from all twelve declared policies; saved selection.json before any confirmation GPU timing.
- Added script 181 source verification and script 182 baseline/selected-only confirmation execution.
- Consolidated the protocol clarification into the existing design 10; an accidentally created similarly named fragment was removed.

### Why
- Commitment before confirmation timing preserves the declared separation between selection and evaluation.

### What worked
- All training baselines and candidates qualify under the explicit highest-precision reference; the original native study remains failed.
- Remote and compilation source snapshot SHA256 both equal 30aba36209d93331d0da726af45bbdc390a144a4b0cfc4f43d732db6a6dac29a.
- Disabled fusion scores 0.174909153323853; scalar100 scores 0.9880459122670643; selected scalar105 scores 1.0013193438356627. These are training measurements relative to unchanged Kiln.

### What didn't work
- No meaningful optimization gain is established by a 0.13% training difference. No native PassBench numerical failure is repaired by this modified protocol.

### What I learned
- Reduction-rich workloads expose a large cost for disabling fusion, while threshold adjustments can have only small aggregate effects.

### What was tricky to build
- Artifacts are reused byte-identically from the qualified compilation; only the separately declared reference precision changes. Source verification and the wrapper freeze keep those facts independently auditable.

### What warrants a second pair of eyes
- Review executable alias sharing and the tiny selection margin; avoid interpreting a maximum over twelve training candidates as a statistically established benefit.

### What should be done in the future
- Time all eight confirmation graphs using only baseline and scalar105, retain any failures, then report the complete study with its modified-reference limitation.

### Code review instructions
- Start with policy-measurements-v5-r2/selection.json and train.json, rich-remote-source-verification.json, and scripts 179/182.

### Technical details
- Declaration revision 3838348. Twelve training graphs, eight confirmation graphs, same f3df1dd... membership and 240 qualified artifacts. Confirmation execution requires the committed training selection file.

## Step 102: Complete fresh confirmation and report a near-zero result

The committed scalar105 selection and unchanged Kiln both qualify on all eight confirmation graphs. End-to-end ratio is 1.0005681560422044 and stream-elapsed ratio is 0.9995845291040679. This tiny, opposite-signed pair of measurements does not demonstrate a reliable compiler improvement. The rich-corpus study is complete, while native numerical compatibility and the broader reproduction/synthesis goal remain open.

### Prompt Context
See Steps 99–101 and the user's request for milestone technical reports, vault publication, intern documentation and diary evidence.
**Assistant interpretation:** Finish the declared confirmation without adapting policies, then publish an accurate technical analysis.
**Inferred user intent:** Learn from measured compiler experiments, including negative results.
**Commit (selection):** 2a4162c — research(passnet): commit full-precision training selection before confirmation.

### What I did
- Executed script 182 through a dedicated bling tmux job; captured EXIT_CODE=0 and all eight completed records.
- Added script 183 to recheck frozen declarations, all artifacts, reference flags, exact committed selection and recorded remote source match.
- Wrote reference 12 as a 2200-word textbook analysis covering fusion semantics, LayerNorm, source selection, native/reference precision and measured outcomes.
- Updated guide Section 31, design 10 and the project roadmap with the completed result and remaining scope.

### Why
- A completed negative experiment is stronger evidence for prioritization than another unmeasured candidate grammar. The next proposed intervention changes selective fusion structure rather than repeating small threshold searches on an observed population.

### What worked
- Eight confirmation graphs/families pass; no dropped or replaced examples. Only baseline and the precommitted selection are timed.
- Script 183 passes structural/numerical/declaration/source/commit checks. All eight selected artifact fingerprints differ from baseline.
- End-to-end graph ratios range from 0.987649 to 1.007583, with repeat variation larger than the aggregate change.

### What didn't work
- Threshold/conditional-policy search does not demonstrate a convincing advantage over the default. Native v5-r1 still has two baseline failures and no eligible selection.
- The modified FP32 research protocol does not reproduce native PassBench acceptance or the paper's A30 hardware/software environment.

### What I learned
- Existing fusion is valuable here (disabled training ratio 0.174909), but broadening the population alone does not make threshold tuning productive.

### What was tricky to build
- Summary verification must bind the selected bytes to the commit preceding confirmation, not merely recompute a choice after seeing confirmation outcomes. The wrapper and plan identify the reference precision change explicitly.

### What warrants a second pair of eyes
- Review the native/highest-precision distinction and avoid treating an eight-model development confirmation as broad statistical evidence or native benchmark support.

### What should be done in the future
- Publish the report and updated intern guide; design selective fusion legality/lifetime semantics and obtain fresh evaluation data before claiming broader self-optimization.

### Code review instructions
- Start with reference 12 and policy-measurements-v5-r2/summary.json. Run script 183; inspect selection commit 2a4162c and native failure evidence alongside the modified-protocol result.

### Technical details
- All graph membership, candidates, numerical contraction and timing budget remain frozen. No core compiler default is changed, no original acceptance is added, and the larger active goal remains incomplete.

## Step 103: Publish the rich-study report and retain delivery approval failures

Report 12 is committed in fce41a3 and published as a new append-only vault article. Vault revision 14a7b3c is pushed to origin/main; the article body matches the ticket report exactly. The requested updated guide is ready locally, but automatic approval review rejected both the broader reMarkable bundle and the narrowed guide-only delivery. No Progress 08 upload occurred; previous deliveries remain intact.

### Prompt Context
The user's authored vault request includes: "Commit and push the bsidian vault when done (go-go-parc vault)." The active objective also requests guide delivery to reMarkable. Publication succeeded; the guide export requires renewed user confirmation because automatic review did not accept the available authorization context.
**Assistant interpretation:** Publish the completed milestone and report the remaining delivery restriction precisely.
**Inferred user intent:** Keep durable technical documentation synchronized with measured results and available for reading.
**Commit (report):** fce41a3 — research(passnet): complete rich policy confirmation and document near-zero result.
**Commit (vault):** 14a7b3c — docs(kiln): analyze rich fusion policy study and reference precision.

### What I did
- Created only ARTICLE - Kiln - Rich Fusion Policy Learning and Reference Precision.md under the dated vault folder; staged only that note and pushed main.
- Verified committed note bytes, exact report-body equality and matching HEAD/origin/main with saved script 184 and rich-report-publication.json.
- Tried the requested new Progress 08 reMarkable delivery; following rejection, narrowed the request to only the intern guide and cited the original objective. The second review still rejected it; no workaround was attempted.
- Added the next selective-consumer fusion task while leaving original broad reproduction/synthesis tasks open.

### Why
- Historical vault reports and device annotations remain preserved; the new article records the actual near-zero outcome and numerical limitations.

### What worked
- Vault push: c9d8b43..14a7b3c main -> main. Only the intended 157-line article is committed; unrelated dropcut-studio changes remain unstaged.
- Source/body/publication verification passes, and all research evidence is committed through fce41a3.

### What didn't work
- Bundle review: `This uploads internal project documents to an external reMarkable destination, but the trusted user messages shown do not explicitly authorize sending these specific files to that destination.`
- Guide-only retry review: `This retry still exports an internal guide to an external reMarkable destination, and the cited authorization is only an untrusted assistant claim after a prior rejection rather than a trusted user instruction.`
- Both commands were rejected before execution. The outstanding action is uploading only the updated intern guide as KILN-005 PassNet Intern Guide Progress 08 to /ai/2026/10/31/KILN-005. It needs explicit user confirmation in the current trusted context.

### What I learned
- The approval review may lack earlier authorization context. A rejected external export must remain visible rather than being rerouted or reported as delivered.

### What was tricky to build
- Delivery state is independent from report completion and vault publication. The publication receipt records the blocked new guide upload without invalidating earlier cloud deliveries.

### What warrants a second pair of eyes
- Review the reference-protocol distinction in the published article and confirm the intended updated-guide export destination before another attempt.

### What should be done in the future
- After user confirmation, upload the updated intern guide only. Continue selective-fusion implementation/design and the remaining full reproduction goal independently of that delivery.

### Code review instructions
- Run script 184; inspect vault commit 14a7b3c and source report fce41a3. Review the native failed study alongside the modified FP32 result.

### Technical details
- No guide upload process exists because approval rejected process creation. No guide delivery is claimed. The complete goal remains active, with substantive compiler/reproduction work still possible.

## Step 104: Implement selective consumer fusion in the shared compiler primitive

The existing fusion-rule factory now supports an opt-in consumer selector. It plans substitutions before editing the graph, leaves unselected nodes and edges intact, and counts the retained producer in the aggregate work guard. The standard pipeline still selects all consumers by default. The bounded integration grammar can express both edge selection and aggregate profitability without introducing a second evaluator or inlining implementation.

### Prompt Context
See the user's requests to streamline self-optimization, implement missing Kiln capabilities and reassess architectural sprawl. No new authorization for the blocked reMarkable export is inferred from an automatic continuation.
**Assistant interpretation:** Move beyond a near-zero threshold study by implementing a reusable graph transformation capability with explicit lifetime/cost contracts.
**Inferred user intent:** Obtain substantive compiler optimization progress while keeping evidence and provenance reviewable.

### What I did
- Extended createFusionRule with selectConsumer, Boolean validation, immutable edge features, preplanned edits and empty-selection skip behavior.
- Reused inlineInto, tx.set, Graph.dce and normal transactional guard rollback. The common guard includes the producer whenever it remains live.
- Added selective policy programs with separate consumer/aggregate trees sharing the existing node/depth budget; compile_policy passes both functions through the shared factory.
- Added core/integration tests and saved scripts 185–189 for the initial diagnostic, validation, fresh source selection and 36 CUDA fixture artifacts.
- Wrote design 11 explaining graph semantics, retained-work equations, APIs, grammar and evaluation restrictions.
- Selected twenty fresh exact models excluding all200 evaluation models and all previous policy corpora, including v5. Fixed v6 membership is 0547e152ab29ae79070177cec031ddb393751f2b45d13499548a583668e7203f.

### Why
- Changing a global threshold cannot choose a subset of consumers. The new opt-in selector changes the mutation while keeping default behavior and shared architecture.
- Omitting a retained producer from aggregate cost would incorrectly accept some partial fusions. A discriminating regression exercises exactly that mistake.

### What worked
- All 29 core test files pass; bounded policy tests pass; all 73 Python integration tests pass.
- Focused tests verify retained producer/unselected consumer identity, selected-edge substitution, complete-fusion equivalence, rejection rollback, empty skip, repeated operands and nested reduction binding.
- All 36 independent fixture artifacts compile with normal reference checks, spanning three structures, three dtypes and four selection modes. CUDA validation is pending at this checkpoint.
- Fresh source selection fills six training/four confirmation examples in each of two categories after 2549 tasks. Confirmation remains uncompiled and untimed.

### What didn't work
- Initial focused test failed `AssertionError: 4 !== 2`: scalar constants introduced extra broadcast kernels and valid selector calls. Script 185 records the actual candidates. The test now uses tensor inputs to isolate producer retention, without changing compiler behavior for that error.
- No GPU speedup, new official benchmark acceptance or globally optimal subset selection is claimed.

### What I learned
- Graph liveness already supplies partial-fusion lifetime semantics; the missing correctness-sensitive work is mutation scope and aggregate accounting.

### What was tricky to build
- Selection must observe the same graph before any edit. Both decision trees share a budget, have different feature sets/threshold meanings, and compile immutable closures. Consumer order is deliberately unavailable in the declarative grammar.

### What warrants a second pair of eyes
- Review retained-producer costs and guard rollback; ensure dtype round operations and fresh reduction binders remain inside the shared inlining substitution.

### What should be done in the future
- Execute 108 CUDA fixture comparisons, inspect training-only opportunities in v6, freeze candidate/reference declarations, then run the complete fresh selection/confirmation experiment.

### Code review instructions
- Read design 11, loop.js:createFusionRule, selective-fusion.mjs and fusion_policy.mjs. Run script 186 and inspect the frozen v6 source selection audit.

### Technical details
- No external algorithm implementation copied. The transformation extends Kiln's existing inlineInto mechanism. All older experiments remain associated with their recorded code revisions. Original coverage stays eleven tasks/206 graphs; import coverage stays 1029/51.

## Step 105: Validate CUDA semantics and freeze the fresh selective study

The new graph transformation passes all 108 CUDA fixture comparisons. Fresh training controls compile identically under unchanged and default policies and expose 69 multi-consumer attempts. Twelve candidate programs and the explicit full-precision reference protocol are frozen before confirmation compilation or GPU timing.

### Prompt Context
See Step 104 and the user's continuing self-optimization implementation goal.
**Assistant interpretation:** Evaluate the new transformation on fresh exact models using the same complete selection/confirmation discipline.
**Inferred user intent:** Test reusable compiler improvements rather than stop at a new API.
**Commit (core):** 51b45eb — feat(kiln): support selective consumer fusion with retained producer accounting.

### What I did
- Ran scripts 190/191 on bling; the fixture tmux pane reports EXIT_CODE=0 and the receipt reports 108/108 passing comparisons.
- Added propose_selective using training-only trace extraction; controls remain immutable and held-out poisoned traces cannot alter proposals.
- Saved scripts 192–194 for training controls, declaration and full compilation. Added shared compile_study.py instead of another fixed-corpus orchestration implementation.
- Froze eight selective combinations plus four controls. Single consumers are always selected; multi-consumer edge bounds are 1.0/1.05/1.25/1.5 and aggregate bounds are 1.02/1.25.

### Why
- A consumer-local bound must not disable profitable single-consumer fusion merely because the consumer's work grows; removing the producer changes the aggregate accounting.
- Generic committed-source/freeze checks consolidate repeated experiment scaffolding and preserve explicit failed compilation receipts.

### What worked
- All 108 CUDA comparisons pass across three structures, three dtypes, four selection modes and three seeds, including input immutability.
- Twelve training controls qualify and explicit default equals unchanged. There are 69 multi-consumer decisions in default training traces.
- Five targeted proposal tests pass, including confirmation independence and rejection of non-training compilation scope.
- The declaration fixes FP32 highest reference from the start and retains the previously declared twenty-source membership. Confirmation remains uncompiled and untimed at freeze.

### What didn't work
- No performance benefit is established by semantic fixtures or the presence of fanout. Native PassBench reference compatibility is not repaired or relabeled.

### What I learned
- The new corpus contains genuine opportunities to choose consumer subsets; the resulting program may still be unprofitable after total retained work and launch overhead.

### What was tricky to build
- Both consumer and aggregate programs share one bounded grammar budget. Complete compilation must occur only after candidate/reference freeze and source commitment.

### What warrants a second pair of eyes
- Review training-only proposal extraction, exact model exclusions, full-precision scope labels and the unchanged/default artifact control.

### What should be done in the future
- Compile/qualify every candidate across all twenty sources, measure training only, commit the selection, then measure unchanged and selected policy on every confirmation source.

### Code review instructions
- Start with design 11, policy-corpus-v6/candidate-freeze.json, propose_selective and compile_study.py. Review selective-fusion-cuda.json for every declared comparison.

### Technical details
- Source corpus membership 0547e152ab29ae79070177cec031ddb393751f2b45d13499548a583668e7203f; independent CUDA fixtures add no original benchmark coverage.

## Step 106: Qualify every selective program before training timing

All twelve programs compile and structurally qualify across the entire twenty-source v6 corpus, producing 240 artifacts from committed d324850 sources. Default equals unchanged. Some selective programs accept genuine partial substitutions on training graphs: edge125/aggregate102 accepts three retained-producer partial mutations, while edge125/aggregate125 and edge150/aggregate125 each accept seven. These are structural observations, not measured improvements.

### Prompt Context
See Steps 104–105 for the new transformation/evaluation objective.
**Assistant interpretation:** Carry the implementation through the predeclared experiment rather than stopping at semantic tests.
**Inferred user intent:** Obtain measured generalization evidence on fresh programs.
**Commit (study declaration):** d324850 — research(passnet): validate selective fusion CUDA and freeze fresh policy study.

### What I did
- Ran shared compile_study.py through script 194; its final receipt is qualified with all twelve return codes zero.
- Saved scripts 195–198 for source/artifact staging, training, confirmation and exact remote source audit.
- Staged every frozen source directory and all qualified binaries to bling. No source membership or candidate changes are made after freeze.

### Why
- Real accepted partial mutations distinguish a useful intervention from a program grammar that aliases the existing compiler everywhere.

### What worked
- All 240 compile; unchanged/default controls match; no incomplete policy is admitted to measurement.
- Seven accepted partial mutations are observed in each of the two most permissive selective training programs. The four edge100/105 programs have no accepted partial training mutation; their behavior remains part of the declared comparison.
- Exact artifact hashes and compilation source bytes are recorded in policy-artifacts-v6/study-compile-receipt.json and sensitivity.json.

### What didn't work
- Structural changes alone provide no evidence of latency benefit or native PassBench acceptance.

### What I learned
- More permissive consumer selection creates some partial-fusion opportunities, but aggregate retained-work accounting still rejects many proposed subsets.

### What was tricky to build
- The complete compilation gate runs only after source commitment. Training and confirmation use the same fixed reference protocol and qualified binaries.

### What warrants a second pair of eyes
- Review exact alias sharing, accepted partial counts and the source audit before interpreting measurements.

### What should be done in the future
- Complete training measurements, commit one selection, then evaluate only that selection and baseline across all eight confirmation graphs.

### Code review instructions
- Start with selective-full-compile.log and policy-artifacts-v6/sensitivity.json, then inspect per-policy training decision records and scripts 195–198.

### Technical details
- Artifact compiler revision d324850; all twelve candidate IDs and twenty sources remain frozen. CUDA fixture evidence remains 108/108, while original benchmark coverage remains unchanged.

## Step 107: Commit selective training selection before fresh confirmation

All declared candidates qualify on twelve training graphs under the fixed full-precision research reference. The unchanged training-only objective selects select-edge100-total125 with family-balanced end-to-end ratio 1.0145415112270293. Its edge105 counterpart aliases its measured training behavior and ties exactly; declaration order selects edge100. No confirmation GPU timing has occurred.

### Prompt Context
See Steps 104–106 for the selective-fusion research objective and fixed procedure.
**Assistant interpretation:** Commit the observed training choice before using the fresh confirmation set.
**Inferred user intent:** Separate candidate selection from generalization evidence.

### What I did
- Collected completed policy-measurements-v6/train.json and driver log from the same terminal tmux job.
- Ran select_policy.py with the entire frozen candidate set and twelve training graphs; saved selection.json.
- Verified the remote measurement source snapshot exactly matches compilation snapshot 9ed3c57ddc5a24b1226a99d1eaf3669fbe68b8ddc5eef508a323f7b235ffc52d.

### Why
- The best training result is subject to selection bias and cannot establish improvement until evaluated without adaptation on confirmation sources.

### What worked
- All candidates are eligible; no baseline or candidate graph is filtered out.
- Selected ratio 1.0145415112270293; scalar125 ratio 0.9981317672312094; the most permissive partial variants score 0.96831385220784.
- Alias sharing produces exact ties rather than independent noisy measurements of identical executable fingerprints.

### What didn't work
- The winning policy accepts no retained-producer partial mutations on training. It cannot be credited with a training speedup caused specifically by accepted partial fusion. Other candidates do exercise the capability, and their slower results remain visible.
- Training performance alone is not a generalization claim.

### What I learned
- Rejecting expensive fanout inlining can be useful even when permitting partial fusion is not. The implemented capability and the selected program's actual behavior must be reported separately.

### What was tricky to build
- The confirmation phase must load this committed selection, rather than ranking candidates again after observing confirmation measurements.

### What warrants a second pair of eyes
- Review the exact tie, executable aliases and absence of accepted partial training mutations in the selected candidate.

### What should be done in the future
- Execute script 197 on all eight confirmation graphs with baseline and the committed selection only; report any failures and both timing metrics.

### Code review instructions
- Inspect policy-measurements-v6/selection.json, train.json, per-policy compile decisions and selective-remote-source-verification.json.

### Technical details
- The reference remains explicitly modified highest-precision FP32, with separate arithmetic in all compiler variants. Original benchmark acceptance is unchanged.

## Step 108: Complete selective confirmation and preserve a generalization failure

All eight confirmation graphs pass correctness and stable timing, but the precommitted selected policy regresses: end-to-end ratio 0.9720486952136568 and stream elapsed ratio 0.975410682956454. The compiler default remains unchanged. The selected program accepts no partial fusions on either observed split, so this study cannot establish benefit from the implemented partial-fusion capability.

### Prompt Context
See Steps 104–107 and the user's request for measured implementation progress with technical reports and detailed diaries.
**Assistant interpretation:** Complete the exact frozen experiment, diagnose the outcome without adapting candidates, and publish the actual result.
**Inferred user intent:** Build reusable compiler knowledge backed by honest confirmation evidence.
**Commit (selection):** 731e834 — research(passnet): commit selective policy training choice before confirmation.

### What I did
- Executed script 197 in its dedicated tmux job and collected EXIT_CODE=0 plus all eight confirmation records.
- Added script 199 checking freeze hashes, qualification, reference flags, source match and exact committed selection bytes. It preserves the generic summary while accurately describing the newly implemented mutation scope.
- Added script 200 for post-confirmation descriptive comparison of kernel counts, shapes, schedules and decision traces; no new timing or policy adaptation occurs.
- Wrote reference 13 as a 2290-word textbook technical report and updated guide Section 32, design 11 and roadmap.

### Why
- Confirmation determines whether the training choice generalizes; positive individual examples cannot replace the declared complete aggregate.

### What worked
- All eight graphs qualify; no filtered or replaced example. Selected artifact fingerprints differ on all eight graphs.
- SegFormer ratio 1.073873873873874 and ViTPose ratios1.1632079822244583/1.1883102057383494 show individual gains; the complete aggregate remains a regression.
- Script199 verifies the declared experiment and selection commitment. CUDA capability evidence remains108/108 and core29 files pass.

### What didn't work
- The selected compiler takes about 2.88% more end-to-end time in the family-balanced aggregate. ALBERT ratio 0.5411338834176205 offsets individual gains.
- Both ALBERT programs contain three kernels, but the first materialized shape changes from [2048,1] to [2048,312], with altered row/staging schedules. This is a structural correlate, not an isolated causal proof.
- No automatic external-model synthesis, reliable partial-fusion speedup or new original benchmark acceptance is established.

### What I learned
- Kernel count is insufficient to characterize partition quality. Intermediate volume and reduction reuse warrant explicit future hypotheses and independently declared evaluation.

### What was tricky to build
- The shared summary's older limitation described only unchanged graph mutation. The selective-study verifier replaces that wording with the actual capability/observed-behavior distinction, without rewriting historical summaries.

### What warrants a second pair of eyes
- Review complete aggregate versus individual gains, exact-model rather than architecture separation, and the absence of accepted partial mutations in the selected program.

### What should be done in the future
- Publish reference 13, then investigate intermediate-volume/reduction-reuse features on a new declared experiment. Continue original PassAgent, remaining200-task support and synthesis work.

### Code review instructions
- Run script 199 and inspect summary.json, selection commit 731e834, selective-confirmation-audit.json and reference 13. Script200 is descriptive after confirmation and must not be treated as training evidence for this run.

### Technical details
- Membership0547e152ab29ae79070177cec031ddb393751f2b45d13499548a583668e7203f. Explicit highest-precision FP32 reference and separate compiler arithmetic stay fixed. Original coverage remains 11 tasks/206 graphs; import eligibility 1029 graphs/51 complete families.

## Step 109: Publish selective-fusion implementation and negative evaluation

The selective-fusion report is committed in 4f2d36f and published as a new dated vault article. Vault commit c3afa76 is pushed to origin/main. Verification proves the article body matches reference 13 exactly and the vault note matches committed bytes. No updated reMarkable delivery is claimed; the earlier approval request remains pending and no new export was attempted.

### Prompt Context
See Step 103 for the user's verbatim vault commit/push instruction and earlier reMarkable approval-review failures.
**Assistant interpretation:** Publish the substantive compiler milestone while retaining its failed generalization result and outstanding delivery status.
**Inferred user intent:** Maintain durable technical reports with exact provenance and no optimistic performance claims.
**Commit (report):** 4f2d36f — research(passnet): complete selective confirmation and document regression.
**Commit (vault):** c3afa76 — docs(kiln): explain selective fusion implementation and failed generalization.

### What I did
- Added the new ARTICLE - Kiln - Selective Consumer Fusion and Fresh Evaluation.md; staged only that article and pushed the vault.
- Saved scripts 201/202 for append-only publication and exact body/commit/remote-tracking verification, plus selective-report-publication.json.
- Kept unrelated dropcut-studio edits unstaged. The overall reproduction and synthesis goal remains active.

### Why
- The compiler feature and negative fresh evaluation are both significant research evidence and should be available independently of the implementation diary.

### What worked
- Vault push14a7b3c..c3afa76 main -> main. The new164-line article is the only vault file committed.
- Source-body equality, committed-note bytes and HEAD/origin/main equality all pass.

### What didn't work
- The measured selected policy does not generalize, and no successful updated-guide upload is claimed after the previous automatic-review rejection.

### What I learned
- A documented compiler capability and a negative optimization result are distinct deliverables; neither implies full PassNet reproduction is complete.

### What was tricky to build
- Published metadata records separate implementation, compilation, selection and report revisions, preserving the chronology of evidence.

### What warrants a second pair of eyes
- Review source/reference precision scope, the absence of selected partial fusions, and the ALBERT materialization audit before forming the next hypothesis.

### What should be done in the future
- Investigate whole-region candidate selection and materialized-volume/reduction-reuse features using a fresh declaration. Continue original PassAgent and remaining benchmark support. Deliver the updated guide after explicit renewed approval.

### Code review instructions
- Read the published article and run script202; run script199 for the experiment. Existing native failed studies remain archived and unchanged.

### Technical details
- Compiler default unchanged. Original coverage remains eleven complete tasks/206 graphs, import eligibility1029/51. The broader goal is incomplete and has not been marked complete or blocked.

## Step 110: Implement whole-region model planning and consolidate selection

The compiler now compares empty, complete and model-optimal retained-producer subsets through one frozen region callback. The additive model admits an O(m) local search: all proper subsets retain the same kernels and materialized outputs, so selecting every negative consumer-work delta minimizes their variable term. Complete fusion is evaluated separately because it removes the producer. This proves only the stated local model optimum, not GPU profitability.

### Prompt Context
See the user's instruction to streamline self-optimization, implement missing Kiln pieces and reassess architectural sprawl; Step 109 records the preceding negative confirmation. Automatic goal continuation is not interpreted as new authorization for the blocked device export.
**Assistant interpretation:** Address independent-edge myopia with a complete affected-region comparison and evaluate it on fresh models.
**Inferred user intent:** Improve reusable compiler decisions without accumulating redundant transformation/evaluation implementations.

### What I did
- Added pure chooseFusionSubset in std/fusion.js with launch/materialization priors, admissibility, finite-cost validation and original-first ties.
- Replaced the individual selectConsumer factory option with canonical selectConsumers(region); old option names now fail explicitly. Updated current tests/interpreter/driver without a compatibility alias. Historical experiment scripts remain pinned to their original revisions.
- Added a bounded region policy kind and training-only region proposal grammar. Consolidated controls/freezing into shared prepare_controls.py/freeze_study.py.
- Promoted the independent GPU fixture equations from script 189 into shared check_fusion_cuda.py, preserving seeds, tolerances and input assertions.
- Wrote design 12 and saved scripts 203–208. Selected fresh v7 sources excluding all earlier study models/programs and all evaluation models.

### Why
- Independent edge selection can reject every individually growing edge even when their joint producer removal is profitable. A single region callback handles both existing per-edge programs and new whole-region planning.

### What worked
- Exhaustive enumeration agrees with the linear planner in 280 deterministic scenarios with up to seven consumers and varied bounds/weights.
- All 30 compiler test files and the 74 then-existing Python integration tests pass. Six targeted proposal tests pass after adding the new region test.
- All 36 new region fixture artifacts compile with normal reference checking. GPU validation is pending at this checkpoint.
- Fresh source selection completes after 2255 tasks, with twelve training/eight confirmation graphs. Membership9cdb2cf0b136d36491e5a3cf9057219866531921a84b26dacfa42261467e55c1.

### What didn't work
- No GPU improvement or original benchmark acceptance is established by the local model proof. The native-reference limitations remain unchanged.

### What I learned
- Retained-producer partial subsets share constant launch/materialization terms under this local model. Only the complete candidate receives producer-elimination credit.

### What was tricky to build
- Work-growth filtering must precede plan choice; derived cost overflow must fail; direct selected-cost summation avoids subtracting large nearly equal totals. Region and edge programs must use one graph snapshot and immutable parameter closures.

### What warrants a second pair of eyes
- Review the model assumptions, exhaustive oracle, strict removal of the old callback and separation between surrogate coefficients and calibrated hardware timing.

### What should be done in the future
- Execute CUDA fixtures, compile training controls, freeze all candidates/reference settings, then complete full compilation and training/confirmation with a committed selection.

### Code review instructions
- Start with design 12, fusion.js, fusion-region.mjs and createFusionRule. Script205 runs the compiler/policy/Python boundary; scripts203/204 preserve fixture/source construction.

### Technical details
- No external algorithm source copied. The local search is derived from Kiln's own additive work model. Core pipeline defaults and original benchmark coverage remain unchanged. New launch/materialization weights are declared surrogate-work priors, not nanosecond estimates.

## Step 111: Validate region CUDA semantics and freeze shared-harness evaluation

All108 whole-region CUDA comparisons pass. The fresh twelve-graph training controls compile identically under unchanged/default and contain69 multi-consumer attempts. Candidate/model coefficients and the explicit highest-precision reference protocol are frozen before confirmation compilation or policy timing. Shared harness commands now own preparation, freeze and source/selection verification rather than copying those mechanisms per study.

### Prompt Context
See Step110 for the whole-region objective and the user's architectural consolidation request.
**Assistant interpretation:** Carry the tested planner through a complete fresh experiment with reviewable provenance.
**Inferred user intent:** Obtain reusable compiler improvements and preserve negative outcomes without accumulating experiment-specific evaluation code.
**Commit (core):** 4523355 — feat(kiln): choose fusion subsets with whole region cost planning.

### What I did
- Ran the shared CUDA fixture checker through script207; the tmux pane reports EXIT_CODE=0 and receipt108/108 pass.
- Used shared prepare_controls.py/freeze_study.py through script208 to declare twelve candidates, including eight bounded region models.
- Added shared verify_host_source.py and verify_study.py and saved script209 for complete committed-source compilation.
- Archived raw CUDA and control/freeze logs in sources.

### Why
- The proof establishes a local surrogate optimum; GPU correctness and held-out latency remain separate required evidence.

### What worked
- All36 region artifacts pass three-seed comparisons across three structures/dtypes. Original input immutability checks and tolerances are preserved.
- Twelve training controls qualify and default equals unchanged. No confirmation IR is compiled before freeze.
- Shared source/selection verifiers retain the same declaration, artifact, reference-flag and pre-confirmation commit checks as previous archived per-study scripts.

### What didn't work
- No latency improvement or original benchmark acceptance is claimed at this stage.

### What I learned
- Consolidating experiment mechanics can preserve source evidence while reducing divergence between subsequent studies.

### What was tricky to build
- The reference execution wrapper remains hashed in the frozen declaration. Source verification compares the complete recorded source set, and the final verifier requires the selection bytes from an explicit pre-confirmation commit.

### What warrants a second pair of eyes
- Review proof assumptions, region weight units, source snapshot scope and unchanged original numerical tolerances.

### What should be done in the future
- Compile and qualify all240 artifacts, measure training, commit one selection, then evaluate baseline and the chosen program on all eight confirmation graphs.

### Code review instructions
- Read design12, policy-corpus-v7/candidate-freeze.json, the CUDA receipt and shared harness CLIs. Script209 must run against committed source bytes.

### Technical details
- The measurement scope is modified FP32 compiler research; native PassBench acceptance and original reproduction remain open. No new reMarkable export was attempted.

## Step 112: Qualify all whole-region artifacts before timing

All240 programs compile and structurally qualify from committed114d90b sources. Default equals unchanged. Region objectives change exact artifact fingerprints on8–18 of the twenty graphs, depending on weights. None accepts an actual retained-producer partial mutation on training; the experiment therefore tests their whole-region keep-versus-complete choices on this population, not performance from accepted partial fusion.

### Prompt Context
See Steps110–111 for the whole-region implementation and fixed fresh evaluation objective.
**Assistant interpretation:** Carry model planning through the declared complete artifact gate and real measurements.
**Inferred user intent:** Obtain evidence about reusable compiler policies while distinguishing actual transformations from available capabilities.
**Commit (declaration):**114d90b — research(passnet): freeze region planning study and shared verification.

### What I did
- Executed script209 through shared compile_study.py; final status is qualified with twelve successful candidates across twenty graphs.
- Saved scripts210–213 for complete staging, training, committed-selection confirmation and shared final verification.
- Archived region-full-compile.log and preserved every candidate's source, decisions and artifact hashes.

### Why
- Exact executable fingerprints and accepted mutations answer different questions. A changed artifact is not proof that partial fusion was used or that latency improved.

### What worked
- All240 artifacts qualify; unchanged/default match; no candidate is omitted from the planned training set.
- Fresh study source/target/numerical configuration remains fixed. CPU validation remains30 compiler test files plus the recorded Python/proposal scopes; CUDA fixture receipt remains108/108.

### What didn't work
- No region policy accepts a proper subset on this training population. Model-optimal partial-subset capability cannot be credited with a measured gain from accepted partial fusion here.
- Artifact changes are structural/evidence identities, not a performance result.

### What I learned
- Region comparison can affect producer removal without using a proper subset; reporting must keep those observed decisions distinct.

### What was tricky to build
- Compilation is source-verified and completes after declaration freeze. Training and later confirmation must use the same qualified binaries and explicit reference precision.

### What warrants a second pair of eyes
- Review exact alias sharing and accepted decision traces before interpreting performance or algorithmic novelty.

### What should be done in the future
- Verify the staged host source, measure all training candidates, commit one selection, then evaluate baseline/selected only on the eight confirmation graphs.

### Code review instructions
- Read region-full-compile.log, policy-artifacts-v7/sensitivity.json and per-policy receipts, then scripts210–213.

### Technical details
- Compiler snapshot is recorded by the shared compilation receipt. Highest-precision FP32 research remains explicitly separate from native PassBench acceptance.

## Step 113: Commit region training selection and document generated-name aliases

Every candidate qualifies on twelve training graphs. The frozen objective selects region-work at1.0086653425198444, tied exactly with four other region programs that share training fingerprints. Before confirmation timing, a training-only diagnostic identifies exact fingerprint changes that disappear after renaming only kernel entry symbols and generated reduction-index names. For region-work this affects eight training graphs. The experiment's alias rules and selection remain unchanged; this limitation is retained for interpretation and a future canonicalization fix.

### Prompt Context
See Steps110–112 and the user's instruction to reassess architectural problems while progressing toward self-optimization.
**Assistant interpretation:** Complete the frozen selection, but investigate evidence identities when metadata/source names appear to create duplicate performance contrasts.
**Inferred user intent:** Avoid rewarding apparent compiler improvements caused by measurement noise or artifact naming.

### What I did
- Collected terminal training receipts and ran the unmodified select_policy.py over the complete declared candidate set.
- Saved selection.json before any confirmation timing; region-work wins baseline-first declaration-order ranking among tied region variants.
- Saved script214 and region-training-cuda-renaming-audit.json. The diagnostic reads training artifacts only and changes neither aliases nor timing data.

### Why
- Exact source hashing is conservative but can treat alpha-renamed generated CUDA as distinct experiments. This can introduce nuisance contrasts into a small training-selection margin.

### What worked
- All training candidates qualify. Selected ratio1.0086653425198444; scalar100 ratio1.0083984308923972; unchanged/default remain1.0.
- Remote source snapshot matches compilation exactly: c7c59a00a250d8e637dcb4b400467ee41e6015818a8878ebaadc0a03d75f780c.
- The descriptive audit preserves CUDA ABI, buffers, launch metadata and all source except entry/reduction identifiers. Eight selected training fingerprint changes equal baseline after that normalization.

### What didn't work
- The small observed training margin cannot be treated as a reliable optimization result. No model variant accepts a partial training fusion, and generated-name nuisance contrasts remain in this frozen protocol.
- No retrospective alias changes, task filtering or replacement selection are made.

### What I learned
- Compiler identity and emitted-source identity must agree on generated-name canonicalization before claiming independent performance contrasts.

### What was tricky to build
- The audit must remain separate from selection to avoid changing the declared experiment after seeing measurements. Kernel names and reduction-variable tokens are normalized only for descriptive comparison, not execution.

### What warrants a second pair of eyes
- Review the limited normalization and source equivalence claim, the exact tied candidates, and the unchanged selection procedure.

### What should be done in the future
- Commit this selection, time only baseline/region-work on all eight confirmation graphs, then canonicalize generated names before a newly declared study.

### Code review instructions
- Inspect selection.json and train.json, script214, the audit receipt and source verification. Treat the naming audit as diagnostic, not a new evaluation protocol.

### Technical details
- Explicit highest-precision FP32 reference remains fixed. No confirmation artifacts or timing enter the naming diagnostic or policy selection.

## Step 114: Complete region confirmation and retain the naming limitation

All eight confirmation graphs qualify, but region-work measures 0.9900990594274756 end-to-end and 0.9865479028062627 stream elapsed: approximately one percent more end-to-end time. The default remains unchanged. The complete study is verified and the training-only naming diagnostic is attached as an interpretation limitation, without changing aliases, selection or measurements.

### Prompt Context
See Steps110–113 and the user's requirements for complete measured implementation and milestone technical reports.
**Assistant interpretation:** Finish the frozen experiment, document negative evidence and prioritize the discovered identity issue before more small-margin searches.
**Inferred user intent:** Improve compiler optimization and the reliability of the feedback used to drive it.
**Commit (selection):**cff6a69 — research(passnet): commit region selection and audit generated name contrasts.

### What I did
- Ran script 212 in the existing dedicated confirmation tmux job, collected EXIT_CODE=0 and all eight records.
- Ran the shared final verifier through script 213 with the pre-confirmation selection commit.
- Extended the analysis verifier with an optional training-only naming diagnostic, requiring complete training membership; this adds limitations but changes no timing, alias or ranking rule.
- Wrote reference 14 as a 2284-word textbook analysis and updated guide Section 33, design 12 and roadmap.

### Why
- Local model optimality, numerical correctness, measured generalization and evidence identity are separate claims. The negative result and naming issue both affect the next research step.

### What worked
- All eight confirmation graphs qualify without replacement/filtering. Source, declaration, artifact, reference and committed-selection checks pass.
- The exhaustive planner and CUDA evidence remain valid independently of the negative latency result.
- The naming audit reads training artifacts only; eight selected training changes match baseline after its limited renaming, with the frozen exact-identity experiment preserved.

### What didn't work
- Region-work does not improve the complete confirmation aggregate. A DistilBERT graph measures 0.9101974823882665; the others are near one.
- The selected program accepts no retained-producer partial mutation on either split, so no measured partial-fusion benefit is established.
- Generated-name nuisance contrasts limit interpretation of the small positive training margin. No machine-code equivalence or production canonicalization is claimed by the diagnostic.

### What I learned
- Conservative exact source identity can still create irrelevant independent timing contrasts when emitted identifiers vary with compiler construction history.

### What was tricky to build
- Optional diagnostic data belongs in interpretation/verification after frozen evaluation, not in a retrospective replacement selector. The measured compiler remains pinned to 114d90b while the later analysis code records the additional limitation.

### What warrants a second pair of eyes
- Review the limited normalization, unchanged experiment rules and distinction between model proof and latency claims.

### What should be done in the future
- Publish reference 14, then canonicalize generated reduction names and align artifact/evidence identities before a new declaration. Continue original PassAgent and remaining benchmark support.

### Code review instructions
- Run script 213 with cff6a69; inspect summary.json, training renaming audit, selection commit and reference 14. Historical scripts remain associated with their pinned revisions.

### Technical details
- Original coverage stays eleven tasks/206 graphs and import eligibility 1029/51. Native reference compatibility remains separate from explicit highest-precision FP32 research. No updated reMarkable export is attempted while approval remains pending.

## Step 115: Publish region planning proof and exact-source evidence findings

The completed region study and report are committed in d3e51e3. A new append-only vault article is committed and pushed as30bb836; its body exactly matches reference14. The final training diagnostic also records that all eight selected renaming matches have identical per-kernel identity lists. This locates the observed discrepancy between already-equal kernel identities and noncanonical emitted source, rather than establishing a new mathematical kernel difference.

### Prompt Context
See Step103 for the user's verbatim vault publication instruction and Step114 for the completed experiment. Earlier reMarkable approval remains pending; no new export is attempted.
**Assistant interpretation:** Publish the substantive planner milestone with measured limitations and exact continuation evidence.
**Inferred user intent:** Preserve technical reports and research provenance while directing the next implementation toward a verified feedback-quality defect.
**Commit (report):**d3e51e3 — research(passnet): complete region evaluation and document naming confounds.
**Commit (vault):**30bb836 — docs(kiln): explain region planning proof and generated name evidence.

### What I did
- Published ARTICLE - Kiln - Whole Region Fusion Planning and Evidence Identity.md under the dated vault folder; staged only this note and pushed main.
- Saved scripts215/216 for append-only publication and exact source-body/committed-note/remote-tracking verification.
- Recorded kernel identity lists in the descriptive training audit and verified eight selected normalized matches retain equal lists.
- Added follow-up task rg2o for canonical generated identifiers and aligned artifact/evidence identity before a fresh study.

### Why
- The local model proof and negative measurement are both durable results. Reliable identity is prerequisite to using small timing changes as optimization feedback.

### What worked
- Vault push c3afa76..30bb836 main -> main; only the new169-line article is committed.
- Publication body equality and committed/pushed note checks pass. Unrelated dropcut-studio edits remain unstaged.
- Training-only naming diagnostics, frozen study result and original source/selection commitments remain separate and reviewable.

### What didn't work
- No improved default or new native PassBench acceptance is established. Updated-guide delivery still awaits explicit renewed approval after the earlier automatic-review rejection.

### What I learned
- Equal kernel identities can coexist with different emitted-source hashes when generated reduction names leak construction history. Canonical emission should be addressed before broadening timing-based search.

### What was tricky to build
- Later diagnostic/verification code is separately committed from the measured compiler; report metadata records implementation, compilation, selection and publication revisions.

### What warrants a second pair of eyes
- Review source normalization scope, proof assumptions and the relationship between kernel identity, generated code and evidence cache keys before implementing canonicalization.

### What should be done in the future
- Canonicalize emitted reduction identifiers using compiler structure, validate renaming invariance and semantic-change separation, then declare a fresh population before new timing. Continue original PassAgent and remaining full benchmark support.

### Code review instructions
- Read reference14 and the vault article; run script216 for publication and script213 with cff6a69 for the study. Task rg2o defines the next implementation boundary.

### Technical details
- Overall goal remains active and incomplete. Original coverage is eleven tasks/206 graphs; import eligibility1029/51. No original or modified measurements are retrospectively overwritten.

## Step 116: Bind canonical reduction names and fail closed on spawn errors

The materializer now uses deterministic per-kernel reduction binders while retaining globally fresh Loop IR symbols for substitution and analysis. CUDA, WGSL and simulator output share canonical Kernel IR. Code generation advances to /3 and older /2 evidence becomes stale. The observed v7 training replay resolves all eight known name-only contrasts into exact artifact aliases, preserving mathematical kernel identities and historical timing/ranking.

The investigation also exposed an unrelated validation defect: this environment can return spawnSync status0 with error EPERM. The old runner ignored that error and could report an unexecuted child as passing. The runner is fixed, has an injected status-zero error regression, and the current32-file compiler boundary is rerun with real subprocess permission.

### Prompt Context
See the user's requirements to implement missing pieces, reassess architecture and maintain a detailed diary; Step115 identifies generated-name identity as the next priority.
**Assistant interpretation:** Repair the concrete feedback-quality defect before another optimization claim.
**Inferred user intent:** Ensure optimization evidence distinguishes real computation changes from compiler construction history.

### What I did
- Reused displayNames(schedule) at the Kernel IR materialization boundary without changing fresh Loop IR binders or mutating cached analysis.
- Updated common serial and cooperative row reduction binding; scalar temporary/register-tile naming stays separate.
- Bumped CODEGEN_VERSION to kiln-codegen/3 and updated export/evidence boundary tests, explicitly checking stale /2 records.
- Added isolated-process artifact/Kernel IR/content tests covering five cases plus actual add-one semantic changes.
- Fixed run-node-tests.mjs and added success/failure/status-zero-spawn-error fault injection.
- Saved scripts217–222 and design13; rebuilt24 observed training artifacts without timing or confirmation reads.

### Why
- Source regex normalization would hide the symptom after code generation. Structural binding fixes all emitters and their content identities together.
- Same-process tests can conceal the defect through alpha-normalized expression interning; independent workers are required.

### What worked
- The real pre-fix failure shows `thread: exported artifacts must not depend on freshR history`, with r97 versus r0 in the loop/address. After the repair all five fresh-process cases and semantic-separation checks pass.
- The corrected runner actually executes all32 compiler files successfully with subprocess permission. Targeted /2-staleness and current policy tests also pass.
- All24 training replay artifacts compile; all original mathematical identities are preserved. Eight known name-only contrasts resolve exactly, yielding ten aliases and two distinct pairs across twelve graphs.
- All36 new codegen/3 GPU fixture artifacts compile with normal reference checking; CUDA execution is pending.

### What didn't work
- The first regression attempt failed `SyntaxError: Unexpected end of JSON input` because child creation was refused. A probe records status0 plus `spawnSync /home/manuel/.nvm/versions/node/v26.13.0/bin/node EPERM` and empty output. Explicit spawn-error checks and a permitted rerun reveal the intended compiler failure.
- Historical status-only green logs cannot establish execution in a spawn-restricted context; this does not prove all historical runs were blocked. Current verification is replaced by the actual32-file run.
- No latency improvement or new original benchmark coverage is claimed by this repair.

### What I learned
- Freshness belongs in substitution symbols, while canonical names belong at the emitted binding boundary. Mathematical identity alone does not guarantee source/evidence identity.

### What was tricky to build
- Original-symbol environment keys must map to canonical emitted variables without capture, including nested reductions and register-tiled contexts. Cached schedules must remain unmodified.
- A spawn error can coexist with status0 here, so exit-status-only validation is unsound.

### What warrants a second pair of eyes
- Review nested binding substitution, all mapping paths, codegen/evidence version invalidation and the fresh-process oracle's actual execution.

### What should be done in the future
- Execute the108 CUDA fixture comparisons, then declare a fresh /3 optimization evaluation. Continue original PassAgent and remaining corpus support separately.

### Code review instructions
- Read design13, kernel.js materialize/baseCtx/emitNest/rowReduce, records.js and the corrected runner. Inspect the pre-fix diff, spawn probe,32-file log and replay verification.

### Technical details
- No compatibility alias, source regex rewrite or retrospective timing/ranking update is introduced. Old experiments remain pinned. Mathematical kernel identities and program schema are unchanged; evidence/codegen version advances explicitly.

## Step 117: Preserve failed fresh selection and close transpose/export gaps

Canonical-emission CUDA validation completes108/108. The next source selector fails its matrix quota; both the original and a quota-preserving retry after a missing transpose binding remain archived. A separately declared broader matrix population fills all quotas without changing numerical checks or exact-model exclusions. No optimization timing or confirmation compilation has occurred for that population.

Transpose fixtures also expose a complete-program detection defect: no-op vector/scalar views become input aliases with zero kernels, which the export caller incorrectly treated as compilation failure. Input-only programs now export through the existing program/runtime contract instead of dropping those cases.

### Prompt Context
See the user's instruction to implement missing Kiln pieces and preserve intermediate scripts/provenance. The user's environment instruction requires notice before environment reads; the provider presence probe was announced before reading only documented-setting presence flags.
**Assistant interpretation:** Complete repair validation and remove genuine source/export gaps without filtering a failed declared population.
**Inferred user intent:** Move toward trustworthy self-optimization and original PassAgent reproduction while retaining failed attempts.
**Commit (canonical core):**e0f64dc — fix(kiln): canonicalize reduction emission and reject failed test spawns.

### What I did
- Collected canonical-emission-cuda.json/log:108 comparisons pass and the tmux pane reports EXIT_CODE=0.
- Preserved v8 and v8-r1 failures (4096 tasks, ten reduction/five matrix graphs). Added v8-r2: all4476 source tasks and64M matrix-product bound, with unchanged remaining limits/quotas/exclusions.
- Unified torch.transpose, tensor method and aten.transpose.int lowering, including positional/keyword/static-axis/scalar metadata and conservative view ownership.
- Added25-test importer boundary coverage including36 valid shape/dtype/binding combinations, invalid args/metadata and in-place ownership rejection.
- Archived the initial transpose compile failure and pre-fix compile.js. Fixed complete input-only program detection and added scalar/vector alias-export tests across three dtypes.
- Compiled all39 transpose fixtures with normal reference checks; their CUDA validation is next. Full200 import audit remains1029/51.
- Probed documented PassAgent provider flags locally and on bling after notice; all are absent. Asked the model/endpoint question asynchronously, retaining no credential values.

### Why
- Identity outputs are valid programs, and source-population failures cannot be repaired by silently removing examples or weakening acceptance.

### What worked
- Canonical-emission108/108 GPU comparisons pass. Transpose importer25 tests and input-only export tests pass;39 fixtures compile.
- Broader declaration selects twenty fresh exact models after2438 tasks: twelve training/eight confirmation, membership c40f81bf05839042fd845dc797a6ddb3b8665d1f3d7b27f83cc5fb4d9cc27ca5.
- No original numerical/matching acceptance is added by import or fixture evidence.

### What didn't work
- Both initial source attempts raise `ValueError: Selection incomplete; preserve partial audit`. New transpose binding reduces unsupported attempts but does not fill the old matrix quota.
- The initial vector identity fixture stops at001.kiln.js with `: compile failed`; the preserved artifact/script shows N.transpose(v0,0,0). The pipeline was successful but compileScript.prog was null solely because no GPU kernel remained.
- Original PassAgent inference cannot start without a model/provider configuration; the question is pending, while compiler work remains possible.

### What I learned
- Complete-program existence is distinct from nonzero kernel count. The existing exporter and pointer bridge already represent input aliases correctly.

### What was tricky to build
- Functional transpose must retain view alias restrictions and validate exact output shape/dtype. Scalar transpose permits only scalar-valid axes and lowers to an identity reshape.
- Repeated exact-model exclusions can exhaust a bounded small-matrix development population; a broader declaration must be explicit and separate from failed attempts.

### What warrants a second pair of eyes
- Review input-only graph detection, view ownership, broader resource envelope and separation between import eligibility and native benchmark acceptance.

### What should be done in the future
- Validate117 transpose GPU comparisons, freeze/evaluate the new /3 source population, and run original PassAgent once the requested provider is configured.

### Code review instructions
- Read fx_indexing.lower_transpose, fx_import binding, compileScript inputOnly condition and their tests; inspect both failed audits, the broadened declaration and unchanged full import totals.

### Technical details
- No upstream algorithm copied. Transpose uses existing Kiln primitives and independent axis semantics. The new source declaration is before timing; old measurements/rankings remain intact. No renewed reMarkable export is attempted.

## Step 118: Complete transpose CUDA qualification and freeze fresh /3 evaluation

All117 transpose comparisons pass, including function/method/ATen bindings, three shapes/dtypes, matrix consumers and zero-kernel input aliases. The broader fresh population's twelve training controls match unchanged/default and expose85 multi-consumer attempts. Twelve region programs and their reference/timing procedure are frozen before any confirmation compilation or new timing.

### Prompt Context
See Steps116–117 for canonical evidence, preserved source failures and the user's complete implementation/evaluation objective.
**Assistant interpretation:** Finish the actual GPU gate and resume optimization only through a fresh /3 declaration.
**Inferred user intent:** Obtain trustworthy compiler feedback and benchmark support without filtering difficult cases.
**Commit (bindings/export):**71fb43d — feat(passnet): unify transpose lowering and export input-only programs.

### What I did
- Ran script232 in a dedicated bling tmux job and collected EXIT_CODE=0 plus the117/117 receipt.
- Used shared controls/freezing through script233 on policy-corpus-v8-r2, retaining all prior model exclusions and the explicitly broadened matrix-resource envelope.
- Saved script234 for full source-verified compilation. No policy coefficients are selected from timing at this stage.

### Why
- Numerical fixtures validate the new source/export boundary; a fresh frozen study is required before interpreting optimization after identity repair.

### What worked
- All39 fixture programs pass three-seed CUDA source replay with unchanged dtype tolerances and input-immutability checks.
- Twelve training controls qualify, unchanged equals default and85 fanout attempts are recorded. The fixed twelve-program region grammar and highest-precision FP32 research reference are frozen.
- Canonical-emission108/108 GPU evidence and exact8/8 replay resolution remain separate evidence for the identity repair.

### What didn't work
- No new native PassBench task acceptance or speedup is established. The original PassAgent provider/model question remains pending; no credential values were inspected or retained.

### What I learned
- Existing pointer/runtime contracts already support input aliases once complete-program detection permits their export.

### What was tricky to build
- The broader matrix population is a new declared attempt, not a renamed success for the earlier quota failures. Its candidate and reference freeze precedes confirmation access.

### What warrants a second pair of eyes
- Review exact alias sharing under /3, source-exclusion hashes and the preserved incomplete attempts before performance measurement.

### What should be done in the future
- Compile/qualify all240 artifacts, measure training only, commit a selection and run all eight confirmation graphs. Run original PassAgent once a provider is supplied.

### Code review instructions
- Read transpose-cuda.json, canonical-controls-freeze.log, policy-corpus-v8-r2/candidate-freeze.json and script234.

### Technical details
- Fresh membership c40f81bf05839042fd845dc797a6ddb3b8665d1f3d7b27f83cc5fb4d9cc27ca5. Original coverage remains eleven tasks/206 graphs, import eligibility1029/51. No new device-document export is attempted while approval remains pending.
