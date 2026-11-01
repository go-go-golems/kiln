/* KILN-011: host-compiled check of the design doc's CUDA helpers (Section 6.5), with __device__
   removed. Reads lines "op dtype a b want" on stdin; prints mismatches and a count.
   Build: gcc -O2 -fsanitize=undefined -fno-sanitize-recover=all 03-validate-c-helpers.c */
#include <stdio.h>
#include <string.h>
#define DEF(T, U, S) \
static inline T floordiv_##S(T a, T b) { if (b == -1) return (T)(0 - (U)a); T q = a / b, r = a % b; return q - (T)((r != 0) & ((r ^ b) < 0)); } \
static inline T remainder_##S(T a, T b) { if (b == -1) return 0; T r = a % b; return r + (((r != 0) & ((r ^ b) < 0)) ? b : 0); } \
static inline T truncdiv_##S(T a, T b) { return b == -1 ? (T)(0 - (U)a) : a / b; } \
static inline T fmod_##S(T a, T b) { return b == -1 ? 0 : a % b; }
DEF(long long, unsigned long long, i64)
DEF(int, unsigned int, i32)
int main(void) {
  char op[16], dt[8]; long long a, b, want; long n = 0, bad = 0;
  while (scanf("%15s %7s %lld %lld %lld", op, dt, &a, &b, &want) == 5) {
    long long got;
    int i64 = !strcmp(dt, "i64");
    if (!strcmp(op, "floordiv")) got = i64 ? floordiv_i64(a, b) : floordiv_i32((int)a, (int)b);
    else if (!strcmp(op, "remainder")) got = i64 ? remainder_i64(a, b) : remainder_i32((int)a, (int)b);
    else if (!strcmp(op, "truncdiv")) got = i64 ? truncdiv_i64(a, b) : truncdiv_i32((int)a, (int)b);
    else got = i64 ? fmod_i64(a, b) : fmod_i32((int)a, (int)b);
    n++; if (got != want) { bad++; printf("MISMATCH %s %s %lld %lld got %lld want %lld\n", op, dt, a, b, got, want); }
  }
  /* trunc INT_MIN / -1 is excluded from the torch data (SIGFPE on CPU): assert the reference's wrap */
  if (truncdiv_i64(-9223372036854775807LL - 1, -1) != -9223372036854775807LL - 1) { bad++; puts("MISMATCH trunc INT64_MIN/-1"); }
  if (truncdiv_i32(-2147483647 - 1, -1) != -2147483647 - 1) { bad++; puts("MISMATCH trunc INT32_MIN/-1"); }
  printf("%ld cases, %ld mismatches\n", n + 2, bad);
  return bad != 0;
}
