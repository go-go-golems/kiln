# Tasks

## TODO
- [ ] Phase 0: exact integer constant folding in loop.js (E.num BigInt exact, intern key, no raw RangeError) <!-- t:4zqu -->
- [ ] Phase 1: typed floordiv/remainder/truncdiv/fmod over i32 and i64 in fns.js, resolveEw rules (integer true div to f32, literal zero divisor), N API, CUDA helpers, test/integer-division.mjs <!-- t:thmj -->
- [ ] Phase 2: importer mappings in fx_import.py (floordiv, mod, torch.div rounding_mode, floor_divide, remainder, fmod, in-place forms) with test_fx_import and test_fx_compose numeric tests <!-- t:7tch -->
- [ ] Phase 3: float floordiv/remainder/fmod/truncdiv (mixed int/float promotion) and identity floor/ceil/round/trunc on integers <!-- t:jgzu -->
- [ ] Phase 4 (GPU host): NVRTC compile and replay vs PyTorch CUDA, PTX inspection, zero-divisor observation, 25 sole-op corpus graphs <!-- t:9idx -->
