# KILN-002 GPU run on manuel@bling

- Started 2026-10-20T20:16:37Z, finished 2026-10-20T20:48:19Z.
- Kiln 33196b5.
- Playback ac835daa9 (image `playback-redaction:kiln-002-ac835daa`), baseline d1faf0cf1.
- Host identity and GPU tenants at the start: `host.txt`.

| stage | verdict | seconds | note |
| --- | --- | ---: | --- |
| kiln-unit | FAIL | 25 | [ELIFECYCLE] Test failed. See above for more details. |
| kiln-image | PASS | 5 |  |
| kiln-selftest | PASS | 3 | 5 launcher fixtures agree with their references |
| kiln-probe | DONE | 3 | NVIDIA GB10: 28.9 TFLOP/s FMA, 240 GB/s read, 2.5 us launch |
| kiln-cuda-compile | PASS | 26 | 146/146 kernels compile for sm_121; spills: 0 |
| kiln-smoke | PASS | 71 | gb10: 18 kernels, 18 agree with the reference; fallback: 18 kernels, 18 agree with the reference; rtx5090: 18 kernels, 18 agree with the reference |
| kiln-spec | DONE | 11 | vs fallback: 4 of 18 kernels get different schedules; measured total of those: gb10 4746 us, fallback 9688 us; vs rtx5090: 11 of 18 kernels get different schedules; measured total of those: gb10 6381 us, rtx5090 3765 us |
| kiln-figures | DONE | 68 | figures/kiln-spec.png, figures/kiln-schedules.png |
| pb-sync | SKIP | 0 | local run: the host clone is the Playback repository |
| pb-image | PASS | 0 | playback-redaction:kiln-002-ac835daa |
| pb-test | KNOWN-FLAKY | 79 | ac835daa9: 1 failed, 674 passed in 15.06s; baseline: 650 passed in 11.06s; TensorRT raw-path test ran; fails at both revisions:  |
| pb-time | PASS | 11 | 0 differing pixels over 24 rows; 768x416 at 100 masks: 3.113 ms with Kiln, 20.459 ms CPU loop; load() 1.333 s |
| pb-ab | PASS | 1486 | gates passed; throughput b/a, median of pairs (not gated): c1 0.987 (0.972-0.996), c4 0.958 (0.948-0.981), c8 0.964 (0.961-0.976) |
| pb-diag | PASS | 114 | ms/frame a -> b: wall 28.39 -> 29.93, infer_preprocess 20.17 -> 22.90 |
