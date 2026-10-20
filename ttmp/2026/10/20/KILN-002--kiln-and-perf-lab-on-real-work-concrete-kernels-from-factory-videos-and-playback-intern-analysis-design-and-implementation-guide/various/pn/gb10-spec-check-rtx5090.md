| case | kernel | gb10 schedule | gb10 model | measured | rtx5090 schedule | rtx5090 model | measured |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| W-26 256 256 | k_matmul_reduce | MAP=tiled,BM=32,BN=16,BK=8,TN=2 | 11.9 | 16.5 | MAP=tiled,BM=32,BN=16,BK=8 | 7.5 | 22.7 |
| W-26 256 768 | k_matmul_reduce | MAP=tiled,BM=32,BN=16,BK=8,TN=2 | 30.1 | 43.0 | MAP=tiled,BM=32,BN=16,BK=8 | 17.4 | 63.6 |
| W-26 512 256 | k_matmul_reduce | MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=2 | 25.9 | 32.9 | same | 13.0 | 32.8 |
| W-26 512 768 | k_matmul_reduce | MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=2 | 72.9 | 88.3 | same | 33.9 | 88.2 |
| W-26 1024 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4 | 69.7 | 98.3 | MAP=tiled,BM=128,BN=64,BK=8,TM=4,TN=2 | 31.8 | 94.4 |
| W-26 1024 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4 | 204 | 265 | MAP=tiled,BM=128,BN=64,BK=8,TM=4,TN=2 | 90.5 | 258 |
| W-26 1536 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 136 | 152 | same | 47.1 | 152 |
| W-26 1536 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 403 | 395 | same | 136 | 396 |
| W-26 2048 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=2 | 257 | 293 | MAP=tiled,BM=64,BN=64,BK=8,TM=8,TN=4 | 87.3 | 278 |
| W-26 2048 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=2 | 766 | 859 | MAP=tiled,BM=64,BN=64,BK=8,TM=8,TN=4 | 257 | 798 |
| W-26 2304 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 314 | 372 | same | 91.7 | 370 |
| W-26 2304 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 936 | 930 | same | 270 | 930 |
| W-28 768x416 8 separable | k_ew | TPB=1024 | 1384 | 60.4 | TPB=64 | 202 | 50.3 |
| W-28 768x416 8 separable | k_ew_2 | TPB=128 | 1292 | 62.5 | TPB=64 | 189 | 59.4 |
| W-28 768x416 100 separable | k_ew | TPB=128,COARSEN=2 | 31088 | 696 | TPB=64 | 4500 | 738 |
| W-28 768x416 100 separable | k_ew_2 | TPB=1024 | 29015 | 1210 | TPB=64 | 4200 | 1064 |
| W-28 768x416 8 direct | k_ew | TPB=1024,COARSEN=2 | 17805 | 2705 | TPB=64 | 2576 | 279 |
| W-28 768x416 100 direct | k_ew | TPB=64 | 400559 | 3482 | same | 57906 | 3483 |
gb10: measured / modelled, geometric mean 0.38, range 0.01–1.43
rtx5090: measured / modelled, geometric mean 1.17, range 0.06–4.03
11 of 18 kernels get different schedules; measured total of those: gb10 6308 us, rtx5090 3705 us
  W-26 256 256 k_matmul_reduce: faster on the GPU: gb10's; gb10 model ranks the same, rtx5090 model ranks the other way
  W-26 256 768 k_matmul_reduce: faster on the GPU: gb10's; gb10 model ranks the same, rtx5090 model ranks the other way
  W-26 1024 256 k_matmul_reduce: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-26 1024 768 k_matmul_reduce: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-26 2048 256 k_matmul_reduce: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-26 2048 768 k_matmul_reduce: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-28 768x416 8 separable k_ew: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-28 768x416 8 separable k_ew_2: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-28 768x416 100 separable k_ew: faster on the GPU: gb10's; gb10 model ranks the same, rtx5090 model ranks the other way
  W-28 768x416 100 separable k_ew_2: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
  W-28 768x416 8 direct k_ew: faster on the GPU: rtx5090's; gb10 model ranks the other way, rtx5090 model ranks the same
