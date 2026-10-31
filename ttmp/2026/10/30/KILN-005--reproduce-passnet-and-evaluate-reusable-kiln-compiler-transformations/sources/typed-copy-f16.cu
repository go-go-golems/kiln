#include <cuda_fp16.h>
extern "C" __global__ void __launch_bounds__(32) typed_copy(const __half* __restrict__ src0, __half* __restrict__ dst) {
    const int tid = threadIdx.x;
    const int bid = blockIdx.x;
    float v = 0.0f;
    v = __half2float(src0[tid]);
    dst[tid] = __float2half_rn(v);
}