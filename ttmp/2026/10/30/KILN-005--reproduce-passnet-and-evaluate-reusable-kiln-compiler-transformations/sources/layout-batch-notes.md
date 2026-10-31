# Static padding, roll, split and chunk batch

Independent implementation in `packages/kiln/src/std/layout.js` and `integrations/passnet/fx_layout.py`; no upstream implementation copied. PyTorch is used only to generate semantic oracle fixtures. Script `550-layout-oracles.py` regenerates `layout-pytorch.json` and `layout-census.json` from the vendored source snapshot and installed PyTorch.

## Evidence and scope

AST census of all vendored `sources/passnet/upstream/graphs/**/model.py` found 1208 constant-pad calls, 37 reflect-pad calls, 226 torch.roll calls, 2067 method chunk calls, 5 torch.chunk calls, 1079 method split calls, and 4317 torch.functional.split calls. These are source call counts across the entire vendored graph tree, not blocked-graph counts or unique benchmark-task coverage. The census retains one path and call per category. Representative pads include six-dimensional pad tuples containing only zeros, prepend-one constant padding, and spatial reflect padding `[1,1,1,1]`; roll includes paired shifts on axes 1 and 2.

## API contracts

`padSpec(shape,pad,mode,value)`, `padReference(input,pad,mode,value)`, `lowerPad(T,input,pad,mode,value,tensor=null)` support constant, reflect, replicate, and circular padding with negative crop. Shapes remain strictly positive. Nonconstant modes accept PyTorch's spatial rank configurations only. Reflection requires each positive padding smaller than the original dimension. Circular padding is limited to one wrap of the cropped input, explicitly rejecting overlapping-copy configurations that PyTorch rejects. Constant padding rejects cropping more than the input, and permits complete cropping if final output remains positive. Nonfinite fill scalars are explicitly rejected.

Padding lowers one axis at a time. Constant pads use bounded gather coordinates followed by select, so masked NaNs cannot leak and loads stay in bounds. Masks occupy only the current axis, not the complete output volume. The tensor dialect argument is required for low-precision constant padding with positive pads: selection explicitly preserves input dtype despite FP32 mask and scalar constants. Frontend reference evaluation must round the fill scalar to output dtype.

`rollSpec`, `rollReference`, `lowerRoll` accept scalar/list shifts, negative axes, repeated axes, and omitted dimensions (flattened logical roll). Modulo coordinates are normalized nonnegative. Shape and dtype remain unchanged.

Importer callbacks `lower_pad` and `lower_roll` follow the existing resolve/literal interface. `lower_partition` returns a list of `N.slice` expressions and validates every list result's shape/dtype. It supports functional/method and ATen split/chunk, positive scalar widths and exact positive section lists, negative dimensions, and fewer-than-requested chunk results. Empty outputs, zero split sizes, dynamic sizes and mutable alias behavior are not supported. Split/chunk results must never receive fresh-storage ownership. Pad/roll return independent logical values and may receive fresh ownership under the importer's existing single-use rules.

Parent agent owns frontend registrations, importer dispatch, list-node metadata resolution, and alias policy. No shared frontend/importer files were edited by this agent.

## Validation and observed failures

`node packages/kiln/test/layout.mjs` passed 32 PyTorch fixtures across pad modes, negative crops, no-op padding, roll flattening, repeated/negative dimensions, invalid contracts and NaN/signed-zero/infinity source preservation. Six representative full compiler pipeline / kernel simulator safety cases passed. FP16/BF16 padding reference and compiler cases passed with explicit typed selection.

An initial plain `T.select` lowering could promote low-precision padding because mask constants are FP32; fixed by passing the tensor dialect and explicitly setting the selection dtype. PyTorch experiments showed circular positive padding exceeding the negatively cropped width fails with overlapping-copy errors; the helper now rejects those configurations explicitly.

`integrations/passnet/test_fx_layout.py` contains functional/ATen equivalence, FP32/FP16/BF16 import cases, metadata rejection, split/chunk import and conservative partition-alias mutation rejection. Initial integration run was before the parent wiring existed: unsupported pad/chunk failures were expected; standalone lower_partition contract passed. Parent integration rerun is required after dispatch is connected. GPU/corpus runs are coordinated by parent; none are claimed here.
