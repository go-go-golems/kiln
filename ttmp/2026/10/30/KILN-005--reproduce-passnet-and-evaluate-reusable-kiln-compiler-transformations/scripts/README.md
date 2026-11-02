# Reproducible investigation scripts

Run corpus tools with the temporary PyArrow environment when needed; FX tools use the installed PyTorch. Workload launch/inspection must use tmux as required by the repository.

- `01-download-dataset.py`: immutable dataset download and LFS SHA256 verification.
- `02-run-reference.py`: untouched evaluator over pinned tasks, explicit paper timing flags, per-task logs and execution receipts. Used inside the existing DGX container.
- `03-materialize-dataset.py`: verified Parquet file-record extraction with path/duplicate checks and manifest.
- `04-export-first-task.py`: reconstruct the actual first FP32 graph interchange and Kiln project, with valid reference-check data. This saves the earlier interactive export procedure as a reusable script; it is not the original shell transcript.
- `05-inspect-progress.sh`: read-only observations of materialization and the full DGX baseline.

Reusable integration code and GPU smoke scripts remain under `integrations/passnet/`; these are tracked implementation artifacts, not disposable copies. Preserve future one-off diagnostics and experiment drivers here, numbered in chronological order. Record each execution and source provenance in the diary. Large generated artifacts belong in `sources/` with manifests/receipts.
