#include <cuda_bf16.h>
extern "C" __global__ void __launch_bounds__(32) typed_copy(const __nv_bfloat16* __restrict__ src0, __nv_bfloat16* __restrict__ dst) {
    const int tid = threadIdx.x;
    const int bid = blockIdx.x;
    float v = 0.0f;
    v = __bfloat162float(src0[tid]);
    dst[tid] = __float2bfloat16_rn(v);
}