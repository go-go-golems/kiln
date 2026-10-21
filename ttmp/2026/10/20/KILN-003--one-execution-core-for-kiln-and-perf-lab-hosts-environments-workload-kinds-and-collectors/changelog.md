# Changelog

## 2026-10-20

- Initial workspace created

## 2026-10-20

Intern guide written (design-doc/01, 33 sections): core model, removals, hosts and transports, environments, probe and offers, workload kinds, collectors, identity, plans and driver, import, one job API, page, security, API reference, phases P0-P6. ML-PERF-003 closed as superseded. Diary step 1.

### Related Files

- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-003--one-execution-core-for-kiln-and-perf-lab-hosts-environments-workload-kinds-and-collectors/design-doc/01-intern-guide-one-execution-core-for-kiln-and-perf-lab.md — The guide

## 2026-10-20

Guide uploaded to reMarkable: /ai/2026/10/20/KILN-003/KILN-003 Intern Guide One Execution Core.pdf

## 2026-10-20

Guide revised: one HTTP driver API on every host (plain TCP, no authentication, drivers started by hand) replaces local/ssh transports; jobs owned by the driver, blobs, long-poll events, PUT /v1/self; dgx reachable only over Tailscale from the Mac. Diary step 2.

## 2026-10-20

Revised guide uploaded to reMarkable: /ai/2026/10/20/KILN-003/KILN-003 Intern Guide One Execution Core v2 HTTP driver.pdf (the first version is kept beside it)

## 2026-10-20

P0/P1 server side: @kiln/exec (model, kinds, collectors, offers, planner, runs), kiln_driver.py, server src/exec (hosts, one job API, archive import), migration 3; executors, runner serve, kiln-docker-python, lab jobs/hosts/seeds removed. Workspace tests green. Diary step 3.

### Related Files

- /Volumes/SSD/code/kiln/apps/server/src/exec/jobs.ts — The one job API
- /Volumes/SSD/code/kiln/packages/exec/src/plan.ts — The planner
- /Volumes/SSD/code/kiln/runner/kiln_driver.py — The driver

## 2026-10-20

Step 4: workbench on hosts — HostDevice, Jobs with verdicts/plan/dry run/reimport, Devices with capability documents; plan_steps column; device.updated after import; u8 dtype in kiln-kernels/1 (79ab40d)

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/src/server-sync.js — HostDevice
- /Volumes/SSD/code/kiln/apps/workbench/src/ui/Jobs.jsx — Jobs view with plans and dry runs

## 2026-10-20

Step 6: deployed a server and drivers on the Mac and bling; collected the demonstration data set (local-sampler on both hosts, the new sampler-hosts preset, ten kernel presets on bling, PR 1005 evidence) with 78 screenshots. Real runs found two identity bugs, fixed in 877c273 (lab hash normal form) and c746899 (device of a CPU capture on a GPU host); 31b769f makes the workbench name lab programs from PRESET_INFO; 670c5ce names a GPU-less host as the reason GPU kinds are blocked.

### Related Files

- /Volumes/SSD/code/kiln/packages/exec/src/plan.ts — device per capture from the environment's GPU
- /Volumes/SSD/code/kiln/packages/lab/presets/sampler-hosts.lab.js — the sampler on two hosts
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-003--one-execution-core-for-kiln-and-perf-lab-hosts-environments-workload-kinds-and-collectors/scripts/05-collect.sh — reproduces the data set
