| case | kernel | gb10 schedule | gb10 model | measured | fallback schedule | fallback model | measured |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: |
| W-26 256 256 | k_matmul_reduce | MAP=tiled,BM=32,BN=16,BK=8,TN=2 | 11.9 | 16.5 | same | 11.1 | 16.6 |
| W-26 256 768 | k_matmul_reduce | MAP=tiled,BM=32,BN=16,BK=8,TN=2 | 30.1 | 43.1 | same | 28.3 | 43.1 |
| W-26 512 256 | k_matmul_reduce | MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=2 | 25.9 | 32.8 | same | 26.1 | 32.3 |
| W-26 512 768 | k_matmul_reduce | MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=2 | 72.9 | 88.2 | same | 73.2 | 88.3 |
| W-26 1024 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4 | 69.7 | 98.5 | same | 70.1 | 98.4 |
| W-26 1024 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4 | 204 | 265 | same | 205 | 264 |
| W-26 1536 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 136 | 154 | same | 136 | 154 |
| W-26 1536 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 403 | 391 | same | 404 | 393 |
| W-26 2048 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=2 | 257 | 295 | same | 258 | 295 |
| W-26 2048 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=2 | 766 | 859 | same | 768 | 867 |
| W-26 2304 256 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 314 | 374 | same | 315 | 372 |
| W-26 2304 768 | k_matmul_reduce | MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2 | 936 | 943 | same | 939 | 916 |
| W-28 768x416 8 separable | k_ew | TPB=1024 | 1384 | 60.3 | same | 202 | 60.4 |
| W-28 768x416 8 separable | k_ew_2 | TPB=128 | 1292 | 61.3 | TPB=1024 | 189 | 77.8 |
| W-28 768x416 100 separable | k_ew | TPB=128,COARSEN=2 | 31088 | 716 | TPB=1024,COARSEN=2 | 4495 | 851 |
| W-28 768x416 100 separable | k_ew_2 | TPB=1024 | 29015 | 1267 | TPB=1024,COARSEN=2 | 4196 | 1087 |
| W-28 768x416 8 direct | k_ew | TPB=1024,COARSEN=2 | 17805 | 2656 | TPB=1024 | 2576 | 7762 |
| W-28 768x416 100 direct | k_ew | TPB=64 | 400559 | 3496 | same | 57895 | 3494 |
gb10: measured / modelled, geometric mean 0.38, range 0.01–1.43
fallback: measured / modelled, geometric mean 0.78, range 0.06–3.01
4 of 18 kernels get different schedules; measured total of those: gb10 4700 us, fallback 9778 us
  W-28 768x416 8 separable k_ew_2: faster on the GPU: gb10's; gb10 model ranks the same, fallback model ranks the other way
  W-28 768x416 100 separable k_ew: faster on the GPU: gb10's; gb10 model ranks the same, fallback model ranks the other way
  W-28 768x416 100 separable k_ew_2: faster on the GPU: fallback's; gb10 model ranks the other way, fallback model ranks the same
  W-28 768x416 8 direct k_ew: faster on the GPU: gb10's; gb10 model ranks the same, fallback model ranks the other way
