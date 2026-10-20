#!/usr/bin/env bash
# Check run-on-gpu-host.sh's pb-test verdicts without a GPU host: the stage function is taken from the script as it
# stands, the host is replaced by a stub that prints canned pytest output, and four cases must get their verdicts.
# A wrong verdict here looks like success (a regression reported as KNOWN-FLAKY), which is why this exists.
#
#   test-pb-test-verdicts.sh        exit 0 when all four cases pass
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

{
  cat <<'EOF'
set -euo pipefail
verdict() { printf %s "$1" >"$out/.stage/$cur.verdict"; [ $# -lt 2 ] || printf %s "$2" >"$out/.stage/$cur.note"; }
note() { printf %s "$1" >"$out/.stage/$cur.note"; }
# the host: a whole-suite run prints the canned output for its revision, a REPS run the canned rerun lines
R() {
  local r kind=full
  [[ $* == REPS=* ]] && kind=reps
  for r in REV BASE; do [[ $* == *" $r"[0-9]* ]] && cat "$cases/$kind-$r"; done
  return 0
}
EOF
  sed -n '/^stage_pb_test() {/,/^}/p' "$here/run-on-gpu-host.sh"
  cat <<'EOF'
out=$1 cases=$2 cur=pb-test rev=REV000000000 baseline=BASE00000000 reps=2 rrun=/run clone=/clone image=image
mkdir -p "$out/.stage" "$out/playback"
(set -e; stage_pb_test) >/dev/null 2>&1 &
if wait $!; then [ -f "$out/.stage/pb-test.verdict" ] || verdict PASS; else verdict FAIL; fi
cat "$out/.stage/pb-test.verdict"
EOF
} >"$work/stage.sh"

t='tests/test_x.py::C::test_x' failed=0
# case name, expected verdict, whole-suite output at the revision and at the baseline, rerun lines at each
check() {
  local d=$work/$1
  mkdir -p "$d"
  printf %b "$3" >"$d/full-REV"; printf %b "$4" >"$d/full-BASE"; printf %b "$5" >"$d/reps-REV"; printf %b "$6" >"$d/reps-BASE"
  local got
  got=$(bash "$work/stage.sh" "$d/out" "$d")
  if [ "$got" = "$2" ]; then echo "ok   $1: $got"; else echo "FAIL $1: expected $2, got $got"; failed=1; fi
}
check passes PASS '5 passed in 1s\n' '4 passed in 1s\n' '' ''
check flaky KNOWN-FLAKY "FAILED $t - AssertionError\n1 failed, 4 passed in 1s\n" '4 passed in 1s\n' \
  "$t\tfail\n$t\tpass\n" "$t\tpass\n$t\tfail\n"
check regression FAIL "FAILED $t - AssertionError\n1 failed, 4 passed in 1s\n" '4 passed in 1s\n' \
  "$t\tfail\n$t\tfail\n" "$t\tpass\n$t\tpass\n"
check no-suite FAIL 'ImportError: no module\n' '4 passed in 1s\n' '' ''
exit $failed
