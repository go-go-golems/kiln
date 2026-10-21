# Tasks

## TODO
- [x] Write the intern guide (design-doc/01) and close ML-PERF-003 as superseded <!-- t:a9lj -->
- [x] P0: @kiln/exec model, requirements, offers, identity; hosts.json with driver URLs; driver client; kiln_driver.py serve with /v1/info, /v1/probe, /v1/self; /api/hosts; capability documents in Devices <!-- t:jygn -->
- [x] P1: driver jobs, blobs, long-poll events, cancel, archives, restart recovery; GPU lock, conditions, gpu-sampler; planner; kiln-kernels/1 and kiln-probe/1; one job API, queueing on the driver; archive import; remove executors, runner serve, kiln-docker-python <!-- t:si2b -->
- [ ] P2: ncu and nsys collectors; kiln-perf built with --ncu; nsys tool mounts; counters and timeline panels <!-- t:ikeh -->
- [ ] P3: kiln-program/1 with kiln_launch.py bench (CUDA events, NVTX); in-program records <!-- t:5vi2 -->
- [ ] P4: playback-dino/1, memory collectors, table migration, lab dock on the one job API; remove synthetic hosts <!-- t:v2ny -->
- [ ] P5: playback-redaction/1 and stage-timers; W-28 in-service board (answers KILN-002 task 3nev) <!-- t:ksch -->
- [ ] P6: torch-function/1 <!-- t:bieo -->
- [ ] Host decision: open GPU counters on bling (NVreg_RestrictProfilingToAdminUsers=0 + reboot) - needs the user's go-ahead <!-- t:8nqq -->
