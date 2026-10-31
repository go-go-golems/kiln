# Scalar binding batch

Implementation: `integrations/passnet/fx_scalar_ops.py`. Existing Kiln primitives already cover all required arithmetic: no duplicate function-table entries, tensor operations, or compatibility adapters were introduced.

`FUNCTIONS` and `METHODS` map source target strings to operation names. `lower_scalar(target, kind, args, kwargs, meta, resolve, literal)` returns `(expression, source_variable, mutates_input)`. Arguments are the importer's decoded JS strings. `resolve` returns operand metadata; `literal` decodes static arguments. The importer must check the returned source variable against its fresh-storage and exactly-one-use rules when `mutates_input` is true. Successfully accepted outputs are fresh. This helper does not authorize mutations itself.

Targets cover functional/ATen hardtanh, functional/ATen/method scalar clamp and clip (including explicit inplace variants), functional/ATen/method scalar power, and cos/sin. Scalars/bounds must be finite; tensor bounds, tensor exponents, mixed dtype/output shape changes, unsupported kwargs and malformed duplicate arguments fail explicitly. Power accepts exactly representable integer scalar exponents through magnitude 2^24. Fractional exponents remain unsupported.

Clamp/hardtanh use ordered comparison/select composition. Existing Kiln max/min CUDA fmaxf/fminf erase some NaNs, and existing ReLU erases input NaN; those operations are deliberately not reused. Bounds narrow to the input dtype first, computation uses FP32, and final result narrows once. Select preserves NaN input and signed zero, and applying lower then upper handles reversed clamp bounds. Hardtanh rejects reversed bounds. Power exponent two uses existing square, so negative bases are valid on CUDA and WGSL. Other integer exponents use existing pow/powf. Existing WGSL builtin pow has a restricted negative-base domain: this batch does not claim faithful WGSL execution for generic integer power. CUDA is the target for the parent campaign.

## Source evidence

Script `560-scalar-source-census.py` inspects actual model.py ASTs for the records in the frozen `import-audit-after-softmax.json`, saving per-call counts and representative source paths in `scalar-source-census.json`. Counts are observed calls across those records, not incremental newly imported graphs.

- 22 hardtanh calls: 10 inplace directly on input placeholders (must remain rejected), 12 noninplace.
- 14 clamp_ calls: representative source computes conv2d, add, divide, then clamp_; the divide result is fresh and single use.
- 12 cos and 12 sin calls; tensor powers in these records use exponent 2.
- Two torch.pow calls use exponent 3.0.
- Existing downstream clamp calls include scalar minimum 1e-5 and 1e-9.

## Validation and boundaries

`561-check-scalar-batch.sh` runs focused Python tests. `scalar-batch-check.log` records two passing tests and 36 PyTorch CPU oracle/reference/decomposition/CUDA-source-emission cases: three storage dtypes; hardtanh; two-bound, reversed-bound and single-bound clamp; cos/sin; powers 0,1,2,3,-1,-2. Inputs include negative values, positive values, both signed zeros, both infinities and NaN. Exceptional classifications and signed zero are compared exactly. Finite comparisons use rtol 2e-6/f32, .001/f16, .008/bf16 plus atol 1e-7. These are numerical tests, not bitwise agreement claims or executed GPU checks.

An initial stricter experiment found CPU BF16 power 3 differs by one BF16 ULP from FP32 opmath followed by narrowing (at approximately -0.334); dtype-appropriate finite tolerance is explicit in the test. An initial fractional exponent probe found CPU float32 pow(x,.5) has sqrt semantics (-inf maps to NaN), while CPU float16 pow(x,.5) returns +inf for -inf; signed-zero behavior also differs. Fractional scalar power was therefore removed from accepted coverage rather than silently claiming one common semantic lowering. GPU execution and whole-import ownership checks belong to parent integration.
