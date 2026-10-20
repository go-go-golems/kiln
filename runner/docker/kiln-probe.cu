// kiln-probe: measure the figures a Kiln target spec (packages/kiln/src/std/targets.js) states about a GPU, on the GPU
// itself, and print them as one JSON object.
//
//   nvcc -O3 -arch=native -o kiln-probe kiln-probe.cu && ./kiln-probe [--quick]
//
// Every timed figure is the median of REPS timed runs after one warm-up run, with the best run beside it.
//   copyGBs   cudaMemcpy device to device, counted as bytes read + bytes written
//   readGBs   a kernel that reads a buffer with 16-byte loads and keeps a sum
//   writeGBs  a kernel that writes a buffer with 16-byte stores
//   fmaTflops a kernel of independent fused multiply-adds, 2 flops each
//   h2dGBs, d2hGBs  pinned host memory to the device and back
//   launch    an empty kernel: alone between two CUDA events, which is how kiln_runner.py times a kernel and so what a
//             target's launchUs predicts (eventUs); host time per launch and event time per launch for 1000 launches
//             back to back; and launch + synchronise round trips on the host clock (roundTripUs)
// The buffers are 1 GiB (--quick: 256 MiB), larger than any current L2, so the bandwidth figures are DRAM figures.
#include <cuda_runtime.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#define CK(x)                                                                                    \
    do {                                                                                         \
        cudaError_t e_ = (x);                                                                    \
        if (e_ != cudaSuccess) {                                                                 \
            printf("{\"error\": \"%s at line %d\"}\n", cudaGetErrorString(e_), __LINE__);        \
            exit(1);                                                                             \
        }                                                                                        \
    } while (0)

static int REPS = 20;

__global__ void empty_kernel() {}

__global__ void read_kernel(const float4* __restrict__ p, size_t n, float* sink) {
    float4 acc = make_float4(0.f, 0.f, 0.f, 0.f);
    for (size_t i = blockIdx.x * (size_t)blockDim.x + threadIdx.x; i < n; i += (size_t)gridDim.x * blockDim.x) {
        float4 v = p[i];
        acc.x += v.x; acc.y += v.y; acc.z += v.z; acc.w += v.w;
    }
    // the buffer is zero-filled, so this store never happens; it keeps the loads from being removed
    if (acc.x + acc.y + acc.z + acc.w == 1234.5f) *sink = acc.x;
}

__global__ void write_kernel(float4* __restrict__ p, size_t n, float v) {
    for (size_t i = blockIdx.x * (size_t)blockDim.x + threadIdx.x; i < n; i += (size_t)gridDim.x * blockDim.x)
        p[i] = make_float4(v, v, v, v);
}

// 8 independent chains per thread, so a warp issues a new FMA every cycle while earlier ones are in flight
__global__ void fma_kernel(float* sink, float a, float b, int iters) {
    float x0 = threadIdx.x, x1 = x0 + 1, x2 = x0 + 2, x3 = x0 + 3, x4 = x0 + 4, x5 = x0 + 5, x6 = x0 + 6, x7 = x0 + 7;
    for (int i = 0; i < iters; i++) {
#pragma unroll
        for (int j = 0; j < 16; j++) {
            x0 = fmaf(x0, a, b); x1 = fmaf(x1, a, b); x2 = fmaf(x2, a, b); x3 = fmaf(x3, a, b);
            x4 = fmaf(x4, a, b); x5 = fmaf(x5, a, b); x6 = fmaf(x6, a, b); x7 = fmaf(x7, a, b);
        }
    }
    float s = x0 + x1 + x2 + x3 + x4 + x5 + x6 + x7;
    if (s == 1234.5f) *sink = s;
}
static const double FMA_PER_ITER = 8 * 16;

struct Stat { double median, best; };

static Stat stat(std::vector<double> v, bool higher_is_better) {
    std::sort(v.begin(), v.end());
    return { v[v.size() / 2], higher_is_better ? v.back() : v.front() };
}

// time `f` (which enqueues work on the default stream) with CUDA events; returns seconds per run
template <class F> static std::vector<double> time_events(F f) {
    cudaEvent_t e0, e1;
    CK(cudaEventCreate(&e0)); CK(cudaEventCreate(&e1));
    f();
    CK(cudaDeviceSynchronize());
    std::vector<double> out;
    for (int r = 0; r < REPS; r++) {
        CK(cudaEventRecord(e0));
        f();
        CK(cudaEventRecord(e1));
        CK(cudaEventSynchronize(e1));
        float ms = 0;
        CK(cudaEventElapsedTime(&ms, e0, e1));
        out.push_back(ms / 1e3);
    }
    CK(cudaGetLastError());
    CK(cudaEventDestroy(e0)); CK(cudaEventDestroy(e1));
    return out;
}

static double now_s() {
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

static void print_stat(const char* name, Stat s, const char* sep = ", ") {
    printf("\"%s\": {\"median\": %.4g, \"best\": %.4g}%s", name, s.median, s.best, sep);
}

int main(int argc, char** argv) {
    bool quick = argc > 1 && !strcmp(argv[1], "--quick");
    if (quick) REPS = 7;
    int d = 0;
    cudaDeviceProp p;
    CK(cudaGetDevice(&d));
    CK(cudaGetDeviceProperties(&p, d));
    int clk = 0, mclk = 0, bus = 0, maxBlocks = 0, rt = 0, drv = 0;
    cudaDeviceGetAttribute(&clk, cudaDevAttrClockRate, d);
    cudaDeviceGetAttribute(&mclk, cudaDevAttrMemoryClockRate, d);
    cudaDeviceGetAttribute(&bus, cudaDevAttrGlobalMemoryBusWidth, d);
    cudaDeviceGetAttribute(&maxBlocks, cudaDevAttrMaxBlocksPerMultiprocessor, d);
    cudaRuntimeGetVersion(&rt);
    cudaDriverGetVersion(&drv);

    const size_t bytes = (quick ? 256ull : 1024ull) << 20, n4 = bytes / 16;
    float4 *a, *b;
    float* sink;
    CK(cudaMalloc(&a, bytes)); CK(cudaMalloc(&b, bytes)); CK(cudaMalloc(&sink, 4));
    CK(cudaMemset(a, 0, bytes)); CK(cudaMemset(b, 0, bytes));
    const int block = 256, grid = p.multiProcessorCount * (p.maxThreadsPerMultiProcessor / block) * 4;

    auto gbs = [&](std::vector<double> t, double moved) {
        for (auto& x : t) x = moved / x / 1e9;
        return stat(t, true);
    };
    Stat copy = gbs(time_events([&] { CK(cudaMemcpy(b, a, bytes, cudaMemcpyDeviceToDevice)); }), 2.0 * bytes);
    Stat rd = gbs(time_events([&] { read_kernel<<<grid, block>>>(a, n4, sink); }), (double)bytes);
    Stat wr = gbs(time_events([&] { write_kernel<<<grid, block>>>(b, n4, 1.0f); }), (double)bytes);

    // FMA: enough blocks for several waves at full occupancy; iterations sized for about 20 ms on a 30 TFLOP/s GPU
    const int fgrid = p.multiProcessorCount * (p.maxThreadsPerMultiProcessor / block) * 8, iters = quick ? 512 : 2048;
    std::vector<double> ft = time_events([&] { fma_kernel<<<fgrid, block>>>(sink, 0.999f, 0.001f, iters); });
    const double flops = 2.0 * FMA_PER_ITER * iters * (double)fgrid * block;
    for (auto& x : ft) x = flops / x / 1e12;
    Stat fma = stat(ft, true);

    // pinned host <-> device, 256 MiB
    const size_t hbytes = 256ull << 20;
    void* h;
    CK(cudaMallocHost(&h, hbytes));
    memset(h, 0, hbytes);
    Stat h2d = gbs(time_events([&] { CK(cudaMemcpy(a, h, hbytes, cudaMemcpyHostToDevice)); }), (double)hbytes);
    Stat d2h = gbs(time_events([&] { CK(cudaMemcpy(h, a, hbytes, cudaMemcpyDeviceToHost)); }), (double)hbytes);
    CK(cudaFreeHost(h));

    // launches: 1000 empty kernels back to back
    const int N = 1000;
    std::vector<double> host_back, gpu_back, sync_rt, single;
    empty_kernel<<<1, 32>>>();
    CK(cudaDeviceSynchronize());
    for (int r = 0; r < REPS; r++) {
        double t0 = now_s();
        for (int i = 0; i < N; i++) empty_kernel<<<1, 32>>>();
        double t1 = now_s();
        CK(cudaDeviceSynchronize());
        host_back.push_back((t1 - t0) / N * 1e6);
    }
    for (double s : time_events([&] { for (int i = 0; i < N; i++) empty_kernel<<<1, 32>>>(); })) gpu_back.push_back(s / N * 1e6);
    for (int r = 0; r < 10; r++)
        for (double s : time_events([&] { empty_kernel<<<1, 32>>>(); })) single.push_back(s * 1e6);
    for (int r = 0; r < REPS * 10; r++) {
        double t0 = now_s();
        empty_kernel<<<1, 32>>>();
        CK(cudaStreamSynchronize(0));
        sync_rt.push_back((now_s() - t0) * 1e6);
    }
    CK(cudaGetLastError());
    CK(cudaFree(a)); CK(cudaFree(b)); CK(cudaFree(sink));

    printf("{\"format\": \"kiln-probe/1\", \"name\": \"%s\", \"cc\": \"%d.%d\", \"sms\": %d, \"clockMHz\": %d, "
           "\"memClockMHz\": %d, \"busBits\": %d, \"l2MB\": %.1f, \"memGB\": %.1f, \"smemPerSM\": %zu, \"smemPerBlock\": %zu, "
           "\"maxThreadsPerBlock\": %d, \"maxThreadsPerSM\": %d, \"maxBlocksPerSM\": %d, \"regsPerSM\": %d, "
           "\"runtime\": %d, \"driver\": %d, \"reps\": %d, \"bufferMiB\": %zu, ",
           p.name, p.major, p.minor, p.multiProcessorCount, clk / 1000, mclk / 1000, bus, p.l2CacheSize / 1048576.0,
           p.totalGlobalMem / 1073741824.0, p.sharedMemPerMultiprocessor, p.sharedMemPerBlock, p.maxThreadsPerBlock,
           p.maxThreadsPerMultiProcessor, maxBlocks, p.regsPerMultiprocessor, rt, drv, REPS, bytes >> 20);
    print_stat("copyGBs", copy);
    print_stat("readGBs", rd);
    print_stat("writeGBs", wr);
    print_stat("fmaTflops", fma);
    print_stat("h2dGBs", h2d);
    print_stat("d2hGBs", d2h);
    printf("\"launch\": {");
    print_stat("eventUs", stat(single, false));
    print_stat("hostUsBackToBack", stat(host_back, false));
    print_stat("gpuUsBackToBack", stat(gpu_back, false));
    print_stat("roundTripUs", stat(sync_rt, false), "");
    printf("}}\n");
    return 0;
}
