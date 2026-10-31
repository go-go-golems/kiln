# Max pooling port handoff

Implemented independently in `packages/kiln/src/std/pooling.js`: `maxPool2dSpec`, `maxPool2dReference`, `lowerMaxPool2d`. Existing average/adaptive code is unchanged. Added `integrations/passnet/fx_max_pooling.py` (`MAX_POOL2D`, `lower_max_pool2d`) and importer regression test `test_fx_max_pooling.py`.

Root integration: import the three JS exports; add an nn `maxPool2d` operation with options `{kernel_size,stride:null,padding:0,dilation:1,ceil_mode:false,return_indices:false}`, shape inference from the spec, reference evaluation from the reference, and existing floating pooling widening/rounding convention. Expose `N.maxPool2d(x,options)` and decompose through `lowerMaxPool2d(T,x,options)`. Import/dispatch `MAX_POOL2D` and `lower_max_pool2d` in fx_import.py analogous to AVG_POOL2D.

Semantics come from pinned PyTorch v2.9.1 `Pool.h`, `DilatedMaxPool2d.cpp`, `DilatedMaxPool2d.cu` in `sources/max-pooling-semantics-v1` (root acquisition script532 and manifest). Output uses effective dilated kernel, floor division, ceil-mode right-padding correction. Padding is restricted to floor(kernel/2), as required by pool2d_shape_check as well as the earlier effective-kernel shape check. Only static positive CHW/NCHW floating values are supported. Indices are explicitly rejected. AST audit script542 found **3027 calls, all return_indices=False**, in checked-in hf_subgraphs_v2 models; evidence is `sources/max-pooling-call-audit-v1.json`.

Lowering clamps every source load before masking. A compact static spatial mask selects real samples versus negative infinity, then a dilated six-dimensional view exposes windows and reduces a flattened kernel axis. Legal dilation-empty windows return negative infinity. Since CUDA fmaxf suppresses NaNs, a second flag reduction detects NaNs using `select(x>0,0,select(x<1,0,1))`: every ordered value, including infinities, satisfies one comparison. The final select restores canonical NaN. No new scalar primitive is needed. Signed-zero tie payload/sign and NaN payload identity are not promised; values and NaN propagation are the scope.

Found two shared primitive correctness issues, handed to root: `REDUCE.max.init` uses negative FLT_MAX rather than negative infinity, and `emit.js` maps all nonfinite literals (including NaN) to finite extreme values. Both must be fixed before edge semantics can pass generated execution. The explicit negative-infinity test currently catches the first bug.

Validation performed:

- `python3 .../scripts/540-max-pooling-fixtures.py`: 78 native installed PyTorch 2.11 CPU oracle cases, covering CHW/NCHW, kernel pairs, default/asymmetric strides, padding, dilation, ceil mode, and f32/f16/bf16 represented inputs. Fixture records exact runtime version.
- `node packages/kiln/test/max-pooling.mjs`: all 78 fixture reference/direct lowering cases pass; explicit all-negative-infinity test fails while shared max identity remains finite. Test additionally covers NaN masking, positive infinity, dilation-empty window, invalid arguments, and three compiler/SIMT cases after shared fix.
- Direct compilation + SIMT checks for default 2x2 and asymmetric dilated padded ceil windows: both passed, one fused kernel each, exact maxAbs 0.
- Standalone Python binding invocation produced expected normalized options and output metadata.
- Importer test awaits root integration.

GPU artifact generator `scripts/541-export-max-pooling-fixtures.mjs` uses N.maxPool2d, exact loop-reference comparisons, MAP=thread, all 78 cases, and exports a manifest with source hashes to `sources/max-pooling-cuda-fixtures-v1` (optional explicit output path). Root runs it after shared integration and batches remote CUDA verification. GPU validation remains pending; no performance claim.
