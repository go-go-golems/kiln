# KILN-002 GPU run on manuel@bling

- Started 2026-10-20T20:51:26Z, finished 2026-10-20T20:54:37Z.
- Kiln 9d409d1.
- Playback ac835daa9 (image `playback-redaction:kiln-002-ac835daa`), baseline d1faf0cf1.
- Host identity and GPU tenants at the start: `host.txt`.

| stage | verdict | seconds | note |
| --- | --- | ---: | --- |
| kiln-unit | PASS | 25 | pnpm test in /home/manuel/code/kiln on bling (host-independent: the packages' own suites) |
| kiln-image | PASS | 4 |  |
| kiln-selftest | PASS | 3 | 5 launcher fixtures agree with their references |
| kiln-probe | DONE | 3 | NVIDIA GB10: 28.9 TFLOP/s FMA, 240 GB/s read, 2.4 us launch |
| kiln-cuda-compile | PASS | 26 | 146/146 kernels compile for sm_121; spills: 0 |
| kiln-smoke | PASS | 68 | gb10: 18 kernels, 18 agree with the reference; fallback: 18 kernels, 18 agree with the reference; rtx5090: 18 kernels, 18 agree with the reference |
| kiln-spec | DONE | 12 | vs fallback: 4 of 18 kernels get different schedules; measured total of those: gb10 4700 us, fallback 9778 us; vs rtx5090: 11 of 18 kernels get different schedules; measured total of those: gb10 6338 us, rtx5090 3776 us |
| kiln-figures | DONE | 1 | figures/kiln-spec.png, figures/kiln-schedules.png |
| pb-sync | SKIP | 0 | local run: the host clone is the Playback repository |
| pb-image | PASS | 0 | playback-redaction:kiln-002-ac835daa |
| pb-test | PASS | 37 | ac835daa9: 675 passed in 15.88s; baseline: 650 passed in 11.46s; TensorRT raw-path test ran |
| pb-time | PASS | 12 | 0 differing pixels over 24 rows; 768x416 at 100 masks: 3.122 ms with Kiln, 20.2 ms CPU loop; load() 1.704 s |
