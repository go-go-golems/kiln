| case | kernel | gb10 schedule | gb10 model | measured | fallback schedule | fallback model | measured |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| W-26 256 256 | k_matmul_reduce | MAP=tiled,BM=32,BN=16,BK=8,TN=2 | 11.9 | 16.5 | same | 11.1 | 16.6 |
| W-26 256 768 | k_matmul_reduce | MAP=tiled,BM=32,BN=16,BK=8,TN=2 | 30.1 | 43.0 | same | 28.3 | 43.0 |
| W-26 512 256 | k_matmul_reduce | MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=2 | 25.9 | 32.9 | same | 26.1 | 31.9 |
| W-26 512 768 | k_matmul_reduce | MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=2 | 72.9 | 88.3 | same | 73.2 | 88.1 |
| W-26 1024 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4 | 69.7 | 98.3 | same | 70.1 | 98.4 |
| W-26 1024 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4 | 204 | 265 | same | 205 | 265 |
| W-26 1536 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 136 | 152 | same | 136 | 152 |
| W-26 1536 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 403 | 395 | same | 404 | 390 |
| W-26 2048 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=2 | 257 | 293 | same | 258 | 291 |
| W-26 2048 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=2 | 766 | 859 | same | 768 | 859 |
| W-26 2304 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 314 | 372 | same | 315 | 371 |
| W-26 2304 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 936 | 930 | same | 939 | 931 |
| W-28 768x416 8 separable | k_ew | TPB=1024 | 1384 | 60.4 | same | 202 | 59.6 |
| W-28 768x416 8 separable | k_ew_2 | TPB=128 | 1292 | 62.5 | TPB=1024 | 189 | 77.8 |
| W-28 768x416 100 separable | k_ew | TPB=128,COARSEN=2 | 31088 | 696 | TPB=1024,COARSEN=2 | 4495 | 862 |
| W-28 768x416 100 separable | k_ew_2 | TPB=1024 | 29015 | 1210 | TPB=1024,COARSEN=2 | 4196 | 1047 |
| W-28 768x416 8 direct | k_ew | TPB=1024,COARSEN=2 | 17805 | 2705 | TPB=1024 | 2576 | 7828 |
| W-28 768x416 100 direct | k_ew | TPB=64 | 400559 | 3482 | same | 57895 | 3479 |
gb10: measured / modelled, geometric mean 0.38, range 0.01–1.43
fallback: measured / modelled, geometric mean 0.77, range 0.06–3.04
4 of 18 kernels get different schedules; measured total of those: gb10 4674 us, fallback 9816 us
  W-28 768x416 8 separable k_ew_2: faster on the GPU: gb10's; gb10 model ranks the same, fallback model ranks the other way
  W-28 768x416 100 separable k_ew: faster on the GPU: gb10's; gb10 model ranks the same, fallback model ranks the other way
  W-28 768x416 100 separable k_ew_2: faster on the GPU: fallback's; gb10 model ranks the other way, fallback model ranks the same
  W-28 768x416 8 direct k_ew: faster on the GPU: gb10's; gb10 model ranks the same, fallback model ranks the other way
