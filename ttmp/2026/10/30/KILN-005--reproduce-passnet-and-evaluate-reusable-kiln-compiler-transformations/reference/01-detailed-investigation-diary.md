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
