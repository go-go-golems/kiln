#include <cuda_fp16.h>
extern "C" __global__ void __launch_bounds__(32) explicit_round(const float* __restrict__ src0, float* __restrict__ dst) {
    const int tid = threadIdx.x;
    const int bid = blockIdx.x;
    float v = 0.0f, r = 0.0f;
    v = src0[tid];
    r = __half2float(__float2half_rn(v));
    dst[tid] = r;
}