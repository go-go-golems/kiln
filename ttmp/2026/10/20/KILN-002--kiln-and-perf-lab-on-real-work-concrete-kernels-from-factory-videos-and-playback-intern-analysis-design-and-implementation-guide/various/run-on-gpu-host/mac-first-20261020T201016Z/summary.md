# KILN-002 GPU run on manuel@bling.local

- Started 2026-10-20T20:10:19Z, finished 2026-10-20T20:13:26Z.
- Kiln c800080 (with uncommitted changes).
- Playback ac835daa9 (image `playback-redaction:kiln-002-ac835daa`), baseline d1faf0cf1.
- Host identity and GPU tenants at the start: `host.txt`.

| stage | verdict | seconds | note |
| --- | --- | ---: | --- |
| kiln-image | PASS | 5 |  |
| kiln-selftest | PASS | 3 | 5 launcher fixtures agree with their references |
| kiln-probe | DONE | 3 | NVIDIA GB10: 28.9 TFLOP/s FMA, 239 GB/s read, 2.4 us launch |
| kiln-smoke | PASS | 103 | gb10: 18 kernels, 18 agree with the reference; fallback: 18 kernels, 18 agree with the reference; rtx5090: 18 kernels, 18 agree with the reference |
| kiln-spec | DONE | 13 | vs fallback: 4 of 18 kernels get different schedules; measured total of those: gb10 4692 us, fallback 9670 us; vs rtx5090: 11 of 18 kernels get different schedules; measured total of those: gb10 6328 us, rtx5090 3749 us |
| kiln-figures | DONE | 2 | figures/kiln-spec.png, figures/kiln-schedules.png |
| pb-sync | PASS | 6 | host clone at ac835daa9 |
| pb-image | PASS | 1 | playback-redaction:kiln-002-ac835daa |
| pb-test | PASS | 36 | ac835daa9: 675 passed in 15.05s; baseline: 650 passed in 10.92s; TensorRT raw-path test ran |
| pb-time | PASS | 14 | 0 differing pixels over 24 rows; 768x416 at 100 masks: 3.107 ms with Kiln, 20.836 ms CPU loop; load() 1.852 s |
