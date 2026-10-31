"""Unit tests of kiln_launch.py's CUDA pointer plumbing on a fake driver, so they run without a GPU:

    python runtime/python/test_kiln_launch.py

The kernels themselves are checked on hardware by ``kiln_launch.py check <fixtures> --backend cuda``.
"""
import ctypes
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kiln_launch  # noqa: E402

# input 0 -> kernel a -> scratch 1 -> kernel b (+ constant 3) -> output 2
PROGRAM = {
    "format": "kiln-program/1", "name": "p",
    "inputs": [{"name": "x", "buffer": 0, "shape": [4]}],
    "outputs": [{"name": "y", "buffer": 2, "shape": [4]}],
    "buffers": [{"id": 0, "bytes": 16, "elements": 4, "dtype": "f32"}, {"id": 1, "bytes": 16, "elements": 4, "dtype": "f32"},
                {"id": 2, "bytes": 16, "elements": 4, "dtype": "f32"},
                {"id": 3, "bytes": 16, "elements": 4, "dtype": "f32", "data": "AACAPwAAgD8AAIA/AACAPw=="}],
    "kernels": [{"name": "a", "cuda": "", "reads": [0], "writes": 1, "grid": 1, "block": 4},
                {"name": "b", "cuda": "", "reads": [1, 3], "writes": 2, "grid": 1, "block": 4}],
}


def _set(ref, value):
    ref._obj.value = value


class FakeDriver:
    """The libcuda entry points CudaProgram calls, recording allocations, context switches and launches."""

    PRIMARY = 0xC0

    def __init__(self):
        self.next_ptr, self.allocs, self.launches, self.ctx_sets = 0x1000, [], [], []
        # By default the primary context is current and something else (PyTorch's runtime) holds one reference to it.
        self.thread_ctx, self.primary_refs, self.foreign = self.PRIMARY, 1, set()

    def _alive(self, ctx):
        return ctx in self.foreign or (ctx == self.PRIMARY and self.primary_refs > 0)

    def cuDevicePrimaryCtxRetain(self, ref, dev): self.primary_refs += 1; _set(ref, self.PRIMARY); return 0
    def cuDevicePrimaryCtxRelease_v2(self, dev): self.primary_refs -= 1; return 0
    def cuCtxGetApiVersion(self, ctx, ref): return 0 if self._alive(ctx.value) else 709

    def cuDeviceGet(self, ref, ordinal): _set(ref, ordinal); return 0
    def cuCtxGetCurrent(self, ref): _set(ref, self.thread_ctx); return 0
    def cuCtxSetCurrent(self, ctx): self.ctx_sets.append(ctx.value); self.thread_ctx = ctx.value; return 0
    def cuDeviceGetAttribute(self, ref, attr, dev): _set(ref, 12 if attr == kiln_launch.CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MAJOR else 0); return 0
    def cuDeviceGetName(self, buf, n, dev): buf.value = b"fake"; return 0
    def cuMemAlloc_v2(self, ref, size): self.next_ptr += 0x100; self.allocs.append((self.next_ptr, size)); _set(ref, self.next_ptr); return 0
    def cuMemcpyHtoD_v2(self, dst, src, n): return 0
    def cuModuleLoadData(self, ref, image):
        if not self._alive(self.thread_ctx):
            return 709                                  # CUDA_ERROR_CONTEXT_IS_DESTROYED
        _set(ref, 0x5000); return 0
    def cuModuleGetFunction(self, ref, mod, name): _set(ref, 0x6000 + len(name)); return 0
    def cuMemFree_v2(self, p): return 0
    def cuModuleUnload(self, m): return 0

    def cuLaunchKernel(self, fn, gx, gy, gz, bx, by, bz, smem, stream, args, extra):
        if not self._alive(self.thread_ctx):
            return 709
        n = len(args)
        self.launches.append(([ctypes.c_uint64.from_address(args[i]).value for i in range(n)], stream.value or 0))
        return 0


class FakeCuda:
    def __init__(self):
        self.cu = FakeDriver()

    def check(self, r, what):
        if r != 0:
            raise RuntimeError(f"{what}: {r}")

    def compile(self, source, entry, arch, include_paths=()):
        return b"image", "cubin"


class CudaProgramPointers(unittest.TestCase):
    def setUp(self):
        self.fake = FakeCuda()
        self._get = kiln_launch._Cuda.get
        kiln_launch._Cuda.get = classmethod(lambda cls: self.fake)

    def tearDown(self):
        kiln_launch._Cuda.get = self._get

    def test_allocate_false_owns_only_constants(self):
        prog = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        self.assertEqual(self.fake.cu.allocs, [(0x1100, 16)])
        self.assertEqual(prog.scratch, [{"id": 1, "bytes": 16}])
        with self.assertRaises(ValueError):
            prog.launch(7, x=0xA0, y=0xB0)                      # no pointer for the intermediate
        with self.assertRaises(RuntimeError):
            prog.write("x", [1, 2, 3, 4])                       # the input belongs to the caller
        prog.launch(7, scratch={1: 0xD0}, x=0xA0, y=0xB0)
        self.assertEqual(self.fake.cu.launches, [([0xA0, 0xD0], 7), ([0xD0, 0x1100, 0xB0], 7)])

    def test_allocate_true_uses_its_own_buffers(self):
        prog = kiln_launch.CudaProgram(PROGRAM)
        own = [p for p, _ in self.fake.cu.allocs]
        self.assertEqual(len(own), 4)
        prog.launch()
        self.assertEqual(self.fake.cu.launches, [([own[0], own[1]], 0), ([own[1], own[3], own[2]], 0)])

    def test_unknown_scratch_id_is_refused(self):
        prog = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        with self.assertRaises(KeyError):
            prog.launch(0, scratch={2: 0xD0}, x=0xA0, y=0xB0)   # buffer 2 is the output, not an intermediate

    def test_launch_makes_the_program_context_current(self):
        prog = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        self.fake.cu.thread_ctx = 0                             # another thread with no context bound
        prog.launch(0, scratch={1: 0xD0}, x=0xA0, y=0xB0)
        self.assertEqual(self.fake.cu.ctx_sets, [0xC0])
        prog.launch(0, scratch={1: 0xD0}, x=0xA0, y=0xB0)       # already current: no second switch
        self.assertEqual(self.fake.cu.ctx_sets, [0xC0])


class CudaProgramContexts(unittest.TestCase):
    """Who holds the primary context. Found on a GB10 (KILN-002 C4): programs opened on a thread with no context bound
    shared the one reference the first of them took, so closing that one destroyed the context under the rest."""

    def setUp(self):
        self.fake = FakeCuda()
        self._get = kiln_launch._Cuda.get
        kiln_launch._Cuda.get = classmethod(lambda cls: self.fake)

    def tearDown(self):
        kiln_launch._Cuda.get = self._get

    def test_each_program_holds_its_own_primary_reference(self):
        cu = self.fake.cu
        cu.thread_ctx, cu.primary_refs = 0, 0                   # a fresh process: nothing bound, nobody holds it
        a = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        b = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        self.assertEqual(cu.primary_refs, 2)
        a.close()
        b.launch(0, scratch={1: 0xD0}, x=0xA0, y=0xB0)          # still alive for b
        b.close()
        self.assertEqual(cu.primary_refs, 0)
        c = kiln_launch.CudaProgram(PROGRAM, allocate=False)   # the thread still names the released context
        c.launch(0, scratch={1: 0xD0}, x=0xA0, y=0xB0)
        c.close()
        self.assertEqual(cu.primary_refs, 0)

    def test_with_pytorch_holding_the_context_close_releases_only_its_own(self):
        prog = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        self.assertEqual(self.fake.cu.primary_refs, 2)
        prog.close()
        self.assertEqual(self.fake.cu.primary_refs, 1)

    def test_a_live_non_primary_context_is_used_as_found(self):
        cu = self.fake.cu
        cu.foreign.add(0xF0)
        cu.thread_ctx = 0xF0
        prog = kiln_launch.CudaProgram(PROGRAM, allocate=False)
        self.assertEqual(cu.primary_refs, 1)                    # no reference kept on a context it does not use
        cu.thread_ctx = 0
        prog.launch(0, scratch={1: 0xD0}, x=0xA0, y=0xB0)
        self.assertEqual(cu.ctx_sets, [0xF0])
        prog.close()
        self.assertEqual(cu.primary_refs, 1)


if __name__ == "__main__":
    unittest.main()
