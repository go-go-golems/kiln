#!/usr/bin/env bash
# Run KILN-002's GPU checks and measurements on a CUDA host from this Mac, and collect the evidence in one directory.
set -euo pipefail

usage() {
  cat <<'USAGE'
usage: run-on-gpu-host.sh [--host USER@HOST | --local] [--out DIR] [--playback] [--ab] [--diag] [options]

Runs KILN-002's GPU work on a CUDA host and collects its text and JSON evidence into one directory. Two ways:
  - from a workstation, --host USER@HOST: Node runs Kiln's CUDA runner executor against the host over SSH (the host
    needs no Node), the Playback stages run in Docker on the host, and the evidence comes back here;
  - on the GPU host itself, --local: the same stages without SSH. The host then needs a Kiln checkout with
    `pnpm install` done (Node >= 26), and the Playback clone is used as it is.

Kiln stages (the default; the host needs Docker with the NVIDIA runtime, and SSH):
  kiln-unit      Kiln's own test suites (pnpm test), on the machine running this script
  kiln-image     build the kiln-perf image on the host (runner/docker/build.sh --host)
  kiln-selftest  the launcher fixtures against the GPU (the image's default command)
  kiln-probe     the GPU's FMA rate, read bandwidth and launch latency, as a Kiln target spec (kiln-probe)
  kiln-cuda-compile  every preset's kernels and the model's alternative schedules, as CUDA, compiled for the host's
                 GPU with NVRTC and ptxas in kiln-perf; registers and spills per kernel (export-cuda.mjs,
                 cuda_check.py)
  kiln-smoke     W-26 and W-28 through the CUDA runner executor, once per --targets spec, every output checked
                 against the Loop IR reference (cuda-runner-smoke.mjs)
  kiln-spec      the gb10 spec's schedules and model against each other target's (gb10-spec-check.mjs; GB10 only)
  kiln-figures   spec and schedule charts (gb10-figures.py)

Playback stages (--playback): Example C, the redaction service whose mask stage the Kiln kernels replace.
  pb-sync        send this Mac's C3 branch as a git bundle; detached checkout of --rev in the host's clone
                 (with --local the clone is the Playback repository, and pb-sync is skipped)
  pb-image       build playback-redaction:kiln-002-<rev> on the host unless it exists (cold: about 14 min)
  pb-test        services/redaction's whole pytest suite in that image at --rev and at --baseline; each test that
                 fails at either is rerun --reps times at both, so a flaky test is told apart from a regression
  pb-time        the mask stage alone: Kiln kernels against the CPU loop, every output compared pixel for pixel
  pb-ab          (--ab) validate_on_host.sh: correctness gates and paired throughput, about 26 min
  pb-diag        (--diag) one more paired run with each arm's stage timers (c4-diag.sh); needs a pb-ab run

options:
  --host USER@HOST     GPU host (default manuel@bling.local)
  --local              run on this machine, which is the GPU host
  --out DIR            evidence directory (default /Volumes/SSD/tmp/kiln-002/runs/<host>-<UTC time>, or with
                       --local ~/kiln-002/evidence/<host>-<UTC time>)
  --stages LIST        comma-separated stages to run instead of the selection the flags make
  --playback           add pb-sync, pb-image, pb-test and pb-time
  --ab                 add pb-ab (implies --playback)
  --diag               add pb-diag (implies --playback; with --ab, or with --validate-dir)
  --targets LIST       smoke specs, gb10 first (default gb10,fallback,rtx5090)
  --native             run the CUDA runner with the host's python3 and nvcc instead of in kiln-perf
  --no-build           skip kiln-image and use the host's kiln-perf:latest as it is
  --playback-repo DIR  local Playback checkout holding the C3 branch (default /Volumes/SSD/code/playback-kiln-002,
                       or with --local the host clone)
  --rev REV            Playback revision to test, an ancestor of that checkout's HEAD (default HEAD; with --local
                       the clone must already be checked out at it)
  --baseline REV       the revision before the change (default d1faf0cf1)
  --host-clone DIR     the host's Playback clone, relative to its home (default code/playback-kiln-002)
  --rebuild            rebuild the redaction image although the tag exists
  --recordings DIR     recorder-shaped bench tree on the host, relative to its home, for pb-ab (default
                       kiln-002/bench-recordings; made by make-bench-recordings.sh from real footage, which stays
                       on the host)
  --validate-dir DIR   an earlier pb-ab output directory on the host, for pb-diag without pb-ab
  --reps N             reruns per revision of each failing test in pb-test (default 5)
  --allow-busy-gpu     run pb-ab and pb-diag although other processes use the GPU. They refuse by default: a
                       shared GPU makes the throughput comparison meaningless, and two more service instances
                       would compete with the other tenant (dgx runs factory-live).
  -h, --help

<out>/summary.md lists every stage with its verdict, duration, note and log. Verdicts: PASS, FAIL, DONE (a
measurement with no gate), KNOWN-FLAKY (every failing test also fails at the baseline), SKIP. Only text, JSON and
charts come back to this machine; rendered segments and bench inputs stay on the host. Exit status 1 if any stage
fails.

examples:
  run-on-gpu-host.sh                                     # Kiln only, about 5 min
  ssh bling.local code/kiln/ttmp/…/scripts/run-on-gpu-host.sh --local --playback   # the same, started on bling
  run-on-gpu-host.sh --playback                          # plus the redaction tests and the stage timing
  run-on-gpu-host.sh --playback --ab --diag              # everything, about 45 min
  run-on-gpu-host.sh --stages pb-test --out DIR          # one stage, into an existing evidence directory
USAGE
}

host=manuel@bling.local local=0 out="" stages="" playback=0 ab=0 diag=0 targets=gb10,fallback,rtx5090 native=0 build=1
pbrepo="" rev=HEAD baseline=d1faf0cf1 host_clone=code/playback-kiln-002 rebuild=0
recordings=kiln-002/bench-recordings validate_dir="" reps=5 allow_busy=0
while [ $# -gt 0 ]; do
  case $1 in
    --host) host=$2; shift 2 ;;
    --local) local=1; shift ;;
    --out) out=$2; shift 2 ;;
    --stages) stages=$2; shift 2 ;;
    --playback) playback=1; shift ;;
    --ab) ab=1 playback=1; shift ;;
    --diag) diag=1 playback=1; shift ;;
    --targets) targets=$2; shift 2 ;;
    --native) native=1; shift ;;
    --no-build) build=0; shift ;;
    --playback-repo) pbrepo=$2; shift 2 ;;
    --rev) rev=$2; shift 2 ;;
    --baseline) baseline=$2; shift 2 ;;
    --host-clone) host_clone=$2; shift 2 ;;
    --rebuild) rebuild=1; shift ;;
    --recordings) recordings=$2; shift 2 ;;
    --validate-dir) validate_dir=$2; shift 2 ;;
    --reps) reps=$2; shift 2 ;;
    --allow-busy-gpu) allow_busy=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

here=$(cd "$(dirname "$0")" && pwd)
kiln=$(git -C "$here" rev-parse --show-toplevel)
if [ -z "$stages" ]; then
  stages="kiln-selftest,kiln-probe,kiln-cuda-compile,kiln-smoke,kiln-spec,kiln-figures"
  [ "$build" = 1 ] && stages="kiln-image,$stages"
  stages="kiln-unit,$stages"
  [ "$playback" = 1 ] && stages="$stages,pb-sync,pb-image,pb-test,pb-time"
  [ "$ab" = 1 ] && stages="$stages,pb-ab"
  [ "$diag" = 1 ] && stages="$stages,pb-diag"
fi
IFS=, read -r -a stage_list <<<"$stages"
IFS=, read -r -a target_list <<<"$targets"
for s in "${stage_list[@]}"; do
  case $s in
    kiln-unit | kiln-image | kiln-selftest | kiln-probe | kiln-cuda-compile | kiln-smoke | kiln-spec | kiln-figures) ;;
    pb-sync | pb-image | pb-test | pb-time | pb-ab | pb-diag) ;;
    *) echo "unknown stage: $s" >&2; exit 2 ;;
  esac
done

# R CMD… : run a shell command on the host. RS ARG… : run the bash script on stdin on the host, with these arguments.
if [ "$local" = 1 ]; then
  host=$(id -un)@$(hostname)
  R() { bash -c "$*"; }
  RS() { bash -s -- "$@"; }
else
  R() { ssh -o BatchMode=yes -o ServerAliveInterval=30 "$host" "$@"; }
  RS() { R "bash -s -- $(printf '%q ' "$@")"; }
fi
[ -d /Volumes/SSD ] && export UV_CACHE_DIR=${UV_CACHE_DIR:-/Volumes/SSD/.uv-cache}
# tar for streams sent to the host: without macOS extended attributes, which GNU tar there warns about
send_tar() { if [ "$(uname)" = Darwin ]; then COPYFILE_DISABLE=1 tar --no-xattrs "$@"; else tar "$@"; fi; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
short=${host#*@}
rhome=$(R 'printf %s "$HOME"')
# rrun: the host's working directory for this run (scripts, validate_on_host and c4-diag outputs, which hold renders
# of real footage); out: the evidence, text, JSON and charts only
rrun=$rhome/kiln-002/runs/$stamp
clone=$rhome/$host_clone
if [ "$local" = 1 ]; then
  out=${out:-$HOME/kiln-002/evidence/$short-$stamp}
  pbrepo=${pbrepo:-$clone}
  clone=$(cd "$pbrepo" && pwd)
else
  out=${out:-/Volumes/SSD/tmp/kiln-002/runs/$short-$stamp}
  pbrepo=${pbrepo:-/Volumes/SSD/code/playback-kiln-002}
fi
mkdir -p "$out"/{logs,kiln,playback,figures}
out=$(cd "$out" && pwd)
# verdicts are this invocation's only, also when --out names an earlier run's directory
rm -rf "$out/.stage" && mkdir "$out/.stage"
case $recordings in /*) ;; *) recordings=$rhome/$recordings ;; esac

need_pb=0
for s in "${stage_list[@]}"; do case $s in pb-*) need_pb=1 ;; esac; done
if [ "$need_pb" = 1 ]; then
  rev=$(git -C "$pbrepo" rev-parse "$rev^{commit}")
  baseline=$(git -C "$pbrepo" rev-parse "$baseline^{commit}")
  image=playback-redaction:kiln-002-${rev:0:8}
  R "mkdir -p $(printf %q "$rrun/scripts")"
  send_tar -C "$here" -cf - pb-pytest.sh mask-post-cuda-time.py c4-diag.sh | R "tar -C $(printf %q "$rrun/scripts") -xf -"
fi

# ---- stage plumbing --------------------------------------------------------------------------------------------
# A stage runs in a background subshell with errexit on (in an `if` or `||` context bash would ignore errexit inside
# the function), writes its log to logs/<stage>.log, and may record a verdict and a one-line note under .stage/.
verdict() { printf %s "$1" >"$out/.stage/$cur.verdict"; [ $# -lt 2 ] || printf %s "$2" >"$out/.stage/$cur.note"; }
note() { printf %s "$1" >"$out/.stage/$cur.note"; }
result() { cat "$out/.stage/$1.verdict" 2>/dev/null || echo NOT-RUN; }
ran() { [ -f "$out/.stage/$1.verdict" ]; }

gpu_tenants() { R "nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader"; }
require_idle_gpu() {
  local t
  t=$(gpu_tenants)
  if [ -n "$t" ] && [ "$allow_busy" = 0 ]; then
    echo "other processes use the GPU (pass --allow-busy-gpu to run anyway):"; echo "$t"; return 1
  fi
  [ -z "$t" ] || { echo "running beside:"; echo "$t"; }
}
# the host's clone must hold the revision under test: pb-image, pb-time, pb-ab and pb-diag read its working tree
require_clone_at_rev() {
  local at
  at=$(R "git -C $(printf %q "$clone") rev-parse HEAD")
  [ "$at" = "$rev" ] || { echo "the host's clone is at $at, not $rev: run pb-sync"; return 1; }
}

# ---- Kiln stages -----------------------------------------------------------------------------------------------
stage_kiln_unit() {
  (cd "$kiln" && pnpm test)
  note "pnpm test in $kiln on $(hostname) (host-independent: the packages' own suites)"
}

stage_kiln_cuda_compile() {
  # every preset's kernels plus the model's alternative schedules at each fork, as CUDA, compiled for this GPU with
  # the image's NVRTC and ptxas: proves the generated CUDA compiles for the host's architecture, with registers and
  # spills per kernel
  (cd "$kiln/apps/workbench" && node build.mjs --gen-only && node test/export-cuda.mjs "$out/kiln/cuda-kernels.json")
  local arch
  arch=$(R "nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -1 | tr -d ." | tr -d '[:space:]')
  R "mkdir -p $(printf %q "$rrun/cuda")"
  send_tar -C "$out/kiln" -cf - cuda-kernels.json | R "tar -C $(printf %q "$rrun/cuda") -xf -"
  send_tar -C "$kiln/apps/workbench/test" -cf - cuda_check.py | R "tar -C $(printf %q "$rrun/cuda") -xf -"
  R "docker run --rm --network none -v $(printf %q "$rrun/cuda"):/k:ro --entrypoint sh kiln-perf:latest -c \
    'python3 /k/cuda_check.py /k/cuda-kernels.json --nvrtc \$(ls /usr/local/cuda/lib64/libnvrtc.so.* | sort -V | tail -1) --ptxas /usr/local/cuda/bin/ptxas --arch $arch'" |
    tee "$out/kiln/cuda-compile.txt"
  note "$(tail -1 "$out/kiln/cuda-compile.txt"); spills: $(grep -c SPILLS "$out/kiln/cuda-compile.txt" || true)"
}

stage_kiln_image() { if [ "$local" = 1 ]; then "$kiln/runner/docker/build.sh"; else "$kiln/runner/docker/build.sh" --host "$host"; fi; }

stage_kiln_selftest() {
  R docker run --rm --gpus all kiln-perf:latest | tee "$out/kiln/selftest.txt"
  note "$(grep -c '^ok ' "$out/kiln/selftest.txt") launcher fixtures agree with their references"
}

stage_kiln_probe() {
  R 'docker run --rm --gpus all --pid host --hostname "$(hostname)" kiln-perf:latest kiln-probe' >"$out/kiln/probe.json"
  verdict DONE "$(python3 - "$out/kiln/probe.json" <<'EOF'
import json, sys
s = json.load(open(sys.argv[1]))["spec"]
print(f"{s.get('name', '?')}: {s['peakTflops']} TFLOP/s FMA, {s['bwGBs']} GB/s read, {s['launchUs']} us launch")
EOF
)"
}

stage_kiln_smoke() {
  local py=python3 t line summary="" where=(--host "$host")
  [ "$local" = 0 ] || where=(--local)
  if [ "$native" = 0 ]; then
    R 'mkdir -p ~/.local/bin && cat > ~/.local/bin/kiln-docker-python && chmod 755 ~/.local/bin/kiln-docker-python' \
      <"$kiln/runner/docker/kiln-docker-python"
    py=$rhome/.local/bin/kiln-docker-python
  fi
  for t in "${target_list[@]}"; do
    node "$here/cuda-runner-smoke.mjs" --kiln "$kiln" "${where[@]}" --python "$py" --target "$t" \
      --out "$out/kiln/smoke-$t.json" 2>&1 | tee "$out/kiln/smoke-$t.log"
    line=$(tail -1 "$out/kiln/smoke-$t.log")
    summary="$summary${summary:+; }$t: $line"
    [[ $line =~ ^([0-9]+)\ kernels,\ ([0-9]+)\ agree ]] && [ "${BASH_REMATCH[1]}" = "${BASH_REMATCH[2]}" ] ||
      { note "$summary"; return 1; }
  done
  note "$summary"
}

stage_kiln_spec() {
  local t
  if [ "${target_list[0]}" != gb10 ] || [ ${#target_list[@]} -lt 2 ]; then
    verdict SKIP "needs gb10 as the first of at least two --targets"; return 0
  fi
  local summary=""
  for t in "${target_list[@]:1}"; do
    node "$here/gb10-spec-check.mjs" --kiln "$kiln" "$out/kiln/smoke-gb10.json" "$out/kiln/smoke-$t.json" --other "$t" \
      --json "$out/kiln/spec-check-$t.json" | tee "$out/kiln/spec-check-$t.md"
    summary="$summary${summary:+; }vs $t: $(grep -E '^[0-9]+ of [0-9]+ kernels' "$out/kiln/spec-check-$t.md")"
  done
  verdict DONE "$summary"
}

stage_kiln_figures() {
  local t checks=()
  for t in "${target_list[@]:1}"; do checks+=(--check "$out/kiln/spec-check-$t.json"); done
  [ ${#checks[@]} -gt 0 ] || { verdict SKIP "no spec checks"; return 0; }
  for kind in spec schedules; do
    uv run --no-project --with matplotlib python "$here/gb10-figures.py" "$kind" "${checks[@]}" --out "$out/figures/kiln-$kind.png"
  done
  verdict DONE "figures/kiln-spec.png, figures/kiln-schedules.png"
}

# ---- Playback stages -------------------------------------------------------------------------------------------
stage_pb_sync() {
  [ "$local" = 0 ] || { verdict SKIP "local run: the host clone is the Playback repository"; return 0; }
  git -C "$pbrepo" merge-base --is-ancestor "$rev" HEAD
  git -C "$pbrepo" merge-base --is-ancestor "$baseline" "$rev"
  local tmp
  tmp=$(mktemp -d /Volumes/SSD/tmp/kiln-002-bundle.XXXXXX)
  git -C "$pbrepo" bundle create "$tmp/playback.bundle" HEAD
  R "cat > $(printf %q "$rrun/playback.bundle")" <"$tmp/playback.bundle"
  rm -rf "$tmp"
  RS "$clone" "$rrun/playback.bundle" "$rev" <<'EOS'
set -euo pipefail
clone=$1 bundle=$2 rev=$3
if [ -d "$clone/.git" ]; then
  # a checkout never discards work: refuse rather than move a clone with uncommitted changes
  if [ -n "$(git -C "$clone" status --porcelain --untracked-files=no)" ]; then
    echo "$clone has uncommitted changes; not touching it" >&2; exit 1
  fi
  git -C "$clone" fetch -q "$bundle" +HEAD:refs/remotes/kiln-002/head
else
  mkdir -p "$(dirname "$clone")"
  git clone -q --no-checkout "$bundle" "$clone"
fi
git -C "$clone" -c advice.detachedHead=false checkout -q --detach "$rev"
git -C "$clone" log --oneline -1
rm "$bundle"
EOS
  note "host clone at ${rev:0:9}"
}

stage_pb_image() {
  require_clone_at_rev
  RS "$clone" "$image" "$rev" "$rebuild" <<'EOS'
set -euo pipefail
clone=$1 image=$2 rev=$3 rebuild=$4
if [ "$rebuild" = 0 ] && docker image inspect "$image" >/dev/null 2>&1; then echo "exists: $image"; exit 0; fi
cd "$clone"
docker build -t "$image" --build-arg GIT_SHA="${rev:0:8}" --build-arg GIT_SHA_FULL="$rev" \
  --build-arg GIT_BRANCH=kiln-002 --build-arg GIT_DIRTY=false services/redaction
EOS
  note "$image"
}

stage_pb_test() {
  local r f ids=() cand=() regress=0 flaky="" runs
  for r in "$rev" "$baseline"; do
    f=$out/playback/pytest-${r:0:9}.txt
    R "$(printf %q "$rrun/scripts/pb-pytest.sh") $(printf '%q ' "$clone" "$r" "$image")" >"$f" 2>&1 || true
    echo "${r:0:9}: $(tail -1 "$f")"
  done
  local fc=$out/playback/pytest-${rev:0:9}.txt fb=$out/playback/pytest-${baseline:0:9}.txt
  grep -qE '[0-9]+ (passed|failed)' "$fc" || { note "the suite did not run at ${rev:0:9}: $(tail -1 "$fc")"; return 1; }
  local trt="TensorRT raw-path test ran"
  grep -q 'SKIPPED.*test_trt_engine_raw' "$fc" && trt="TensorRT raw-path test skipped (no cached engine)"
  runs="${rev:0:9}: $(tail -1 "$fc" | tr -d '=' | xargs); baseline: $(tail -1 "$fb" | tr -d '=' | xargs); $trt"
  mapfile -t cand < <(grep -hE '^(FAILED|ERROR) ' "$fc" | awk '{print $2}' | sort -u)
  [ ${#cand[@]} -gt 0 ] || { verdict PASS "$runs"; return 0; }
  mapfile -t ids < <(grep -hE '^(FAILED|ERROR) ' "$fc" "$fb" | awk '{print $2}' | sort -u)
  for r in "$rev" "$baseline"; do
    R "REPS=$reps $(printf %q "$rrun/scripts/pb-pytest.sh") $(printf '%q ' "$clone" "$r" "$image" "${ids[@]}")" \
      >"$out/playback/pytest-reruns-${r:0:9}.tsv"
  done
  {
    echo "| test | ${rev:0:9} fails | ${baseline:0:9} fails |"
    echo "| --- | ---: | ---: |"
    local id fails_c fails_b
    for id in "${ids[@]}"; do
      # the full run counts as one more run of each test
      fails_c=$(( $(grep -c "^$id"$'\t'"fail" "$out/playback/pytest-reruns-${rev:0:9}.tsv" || true) + $(grep -cE "^(FAILED|ERROR) $id( |$)" "$fc" || true) ))
      fails_b=$(( $(grep -c "^$id"$'\t'"fail" "$out/playback/pytest-reruns-${baseline:0:9}.tsv" || true) + $(grep -cE "^(FAILED|ERROR) $id( |$)" "$fb" || true) ))
      echo "| \`$id\` | $fails_c of $((reps + 1)) | $fails_b of $((reps + 1)) |"
      if printf '%s\n' "${cand[@]}" | grep -qxF "$id"; then
        if [ "$fails_b" = 0 ]; then regress=1; else flaky="$flaky${flaky:+, }${id##*::} ($fails_c/$((reps + 1)) vs $fails_b/$((reps + 1)))"; fi
      fi
    done
  } | tee "$out/playback/pytest-reruns.md"
  if [ "$regress" = 1 ]; then
    note "$runs; a test fails at ${rev:0:9} and never at the baseline (playback/pytest-reruns.md)"; return 1
  fi
  verdict KNOWN-FLAKY "$runs; fails at both revisions: $flaky"
}

stage_pb_time() {
  require_clone_at_rev
  R "docker run --rm --gpus all -v $(printf %q "$clone/services/redaction"):/w:ro -v $(printf %q "$rrun/scripts"):/k:ro \
    -w /w -e PYTHONPATH=/w -e PYTHONDONTWRITEBYTECODE=1 --entrypoint sh $image \
    -c 'python3 /k/mask-post-cuda-time.py --out /tmp/o.json >&2 && cat /tmp/o.json'" >"$out/playback/mask-post-cuda-time.json"
  uv run --no-project --with matplotlib python "$here/gb10-figures.py" timing --time "$short=$out/playback/mask-post-cuda-time.json" --out "$out/figures/pb-mask-post-timing.png"
  local n
  n=$(python3 - "$out/playback/mask-post-cuda-time.json" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1]))
r = next(r for r in d["rows"] if r["geometry"] == "768x416" and r["masks"] == 100)
print(d["differing"], f"{d['differing']} differing pixels over {len(d['rows'])} rows; 768x416 at 100 masks:"
      f" {r['gpu_ms']} ms with Kiln, {r['cpu_ms']} ms CPU loop; load() {d['load_s']} s")
EOF
)
  note "${n#* }"
  [ "${n%% *}" = 0 ]
}

stage_pb_ab() {
  require_idle_gpu
  require_clone_at_rev
  R "test -d $(printf %q "$recordings")" ||
    { echo "no bench recordings at $recordings: make them with make-bench-recordings.sh and copy them there"; return 1; }
  RS "$clone" "$image" "$recordings" "$baseline" "$rrun/validate" <<'EOS'
set -euo pipefail
cd "$1"
services/redaction/scripts/validate_on_host.sh --image "$2" --recordings "$3" --baseline "$4" \
  --candidate-env REDACTION_MASK_POST=kiln --out "$5"
EOS
  local d=$out/playback/validate
  mkdir -p "$d"
  # text and JSON only: the bench subdirectories hold real footage and its renders
  R "cd $(printf %q "$rrun/validate") && tar cf - \$(find . -maxdepth 1 -type f \( -name '*.json' -o -name '*.txt' \)) bench/staged.json" |
    tar -C "$d" -xf -
  note "gates passed; throughput b/a, median of pairs (not gated): $(python3 - "$d/throughput.txt" <<'EOF'
import re, sys
conc, parts = None, []
for line in open(sys.argv[1]):
    if m := re.match(r"=== concurrency (\d+)", line): conc = m.group(1)
    if m := re.search(r"ratio median=([0-9.]+) \(min ([0-9.]+), max ([0-9.]+)\)", line): parts.append(f"c{conc} {m.group(1)} ({m.group(2)}-{m.group(3)})")
print(", ".join(parts))
EOF
)"
}

stage_pb_diag() {
  require_idle_gpu
  require_clone_at_rev
  local v=${validate_dir:-$rrun/validate}
  case $v in /*) ;; *) v=$rhome/$v ;; esac
  R "test -d $(printf %q "$v/bench/people")" || { echo "no pb-ab run at $v: run pb-ab, or name one with --validate-dir"; return 1; }
  R "IMG=$image SVC=$(printf %q "$clone/services/redaction") VALIDATE=$(printf %q "$v") OUT=$(printf %q "$rrun/diag") bash $(printf %q "$rrun/scripts/c4-diag.sh")"
  local d=$out/playback/diag
  mkdir -p "$d"
  R "cd $(printf %q "$rrun/diag") && tar cf - throughput.json throughput.txt arm-a.log arm-b.log" | tar -C "$d" -xf -
  local arm
  for arm in a b; do
    python3 "$pbrepo/services/redaction/scripts/parse_segment_timing.py" "$d/arm-$arm.log" 144 >"$d/timing-$arm.txt"
  done
  note "$(python3 - "$d/timing-a.txt" "$d/timing-b.txt" <<'EOF'
import re, sys
def per_frame(path):
    t = open(path).read()
    pre = re.search(r"infer_preprocess\s+[0-9.]+ ms\s+\(\s*([0-9.]+) ms/frame", t).group(1)
    wall = re.search(r"wall_ms\s+[0-9.]+\s+([0-9.]+)", t).group(1)
    return pre, wall
(pa, wa), (pb, wb) = per_frame(sys.argv[1]), per_frame(sys.argv[2])
print(f"ms/frame a -> b: wall {wa} -> {wb}, infer_preprocess {pa} -> {pb}")
EOF
)"
}

# ---- run -------------------------------------------------------------------------------------------------------
{
  echo "host: $host"; R 'uname -srm; nvidia-smi -L; nvidia-smi --query-gpu=driver_version,clocks.sm,temperature.gpu,power.draw --format=csv,noheader; docker --version'
  echo "GPU compute processes:"; gpu_tenants
} >"$out/host.txt" 2>&1 || true

started=$(date -u +%FT%TZ)
write_summary() {
  local s v
  {
    echo "# KILN-002 GPU run on $host"
    echo
    echo "- Started $started, finished $(date -u +%FT%TZ)."
    echo "- Kiln $(git -C "$kiln" rev-parse --short HEAD)$(git -C "$kiln" diff --quiet HEAD -- runner packages apps 2>/dev/null || echo ' (with uncommitted changes)')."
    [ "$need_pb" = 0 ] || echo "- Playback ${rev:0:9} (image \`$image\`), baseline ${baseline:0:9}."
    echo "- Host identity and GPU tenants at the start: \`host.txt\`."
    echo
    echo "| stage | verdict | seconds | note |"
    echo "| --- | --- | ---: | --- |"
    for s in "${stage_list[@]}"; do
      v=$(result "$s")
      echo "| $s | $v | $(cat "$out/.stage/$s.secs" 2>/dev/null || echo -) | $(cat "$out/.stage/$s.note" 2>/dev/null | tr '|' '/') |"
    done
  } >"$out/summary.md"
}
trap write_summary EXIT

failed=0
for s in "${stage_list[@]}"; do
  cur=$s
  dep=""
  case $s in
    kiln-spec) dep="kiln-smoke" ;; kiln-figures) dep="kiln-spec" ;;
    pb-image) dep="pb-sync" ;; pb-test | pb-time | pb-ab | pb-diag) dep="pb-image" ;;
  esac
  if [ -n "$dep" ] && ran "$dep" && [ "$(result "$dep")" = FAIL ]; then
    verdict SKIP "$dep failed"; printf '%-14s SKIP (%s failed)\n' "$s" "$dep"; continue
  fi
  printf '%-14s ... ' "$s"
  t0=$SECONDS
  (set -e; "stage_${s//-/_}") >"$out/logs/$s.log" 2>&1 &
  if wait $!; then
    [ -f "$out/.stage/$s.verdict" ] || verdict PASS
  else
    verdict FAIL
    [ -f "$out/.stage/$s.note" ] || note "$(tail -1 "$out/logs/$s.log")"
    failed=1
  fi
  echo $((SECONDS - t0)) >"$out/.stage/$s.secs"
  printf '%s (%ss)\n' "$(result "$s")" $((SECONDS - t0))
done

gpu_tenants >"$out/gpu-after.txt" 2>&1 || true
write_summary
trap - EXIT
echo
cat "$out/summary.md"
echo
echo "evidence: $out"
exit $failed
