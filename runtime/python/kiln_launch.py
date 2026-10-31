"""Run a kiln-program/1 export from Python.

Two backends read the same export:

- ``wgpu`` runs the WGSL kernels through wgpu-native (Metal on a Mac, Vulkan or D3D12 elsewhere). Needs the ``wgpu``
  package.
- ``cuda`` runs the CUDA kernels: NVRTC compiles each one for the device's architecture and the driver API launches
  it, both through ``ctypes``. No Python CUDA package is needed, only ``libcuda`` and ``libnvrtc`` (a PyTorch install
  ships the latter; set ``KILN_NVRTC`` to its path when it is not found).

One file with only NumPy as a hard dependency, so a consumer vendors it byte-identical with a header naming this
source (KILN ``runtime/python/kiln_launch.py``).

    prog = kiln_launch.open_program("grey-1080p.json", backend="wgpu")
    out = prog.run(rgb=frame)            # {"grey": float32 array shaped like the output}
    prog.close()

On the ``cuda`` backend, ``launch(stream, **pointers)`` runs on device pointers the caller owns (for example
``tensor.data_ptr()`` with ``torch.cuda.current_stream().cuda_stream``) without any copy or synchronisation.

As a script, ``python kiln_launch.py check <fixtures-dir> [--backend wgpu|cuda]`` runs the round-trip fixtures made by
``runtime/test/fixtures.mjs`` and exits non-zero on any mismatch.
"""

from __future__ import annotations

import base64
import ctypes
import ctypes.util
import glob
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

FORMAT = "kiln-program/1"
__all__ = ["FORMAT", "load", "open_program", "Program", "WgpuProgram", "CudaProgram", "gen"]


def load(program) -> dict:
    """A kiln-program/1 object from a dict, a JSON string, or a path."""
    if isinstance(program, dict):
        p = program
    elif isinstance(program, (str, os.PathLike)) and not str(program).lstrip().startswith("{"):
        p = json.loads(Path(program).read_text())
    else:
        p = json.loads(program)
    if p.get("format") != FORMAT:
        raise ValueError(f"not a {FORMAT} export: format {p.get('format')!r}")
    return p


def open_program(program, backend: str = "wgpu", **kw) -> "Program":
    p = load(program)
    if backend == "wgpu":
        return WgpuProgram(p, **kw)
    if backend == "cuda":
        return CudaProgram(p, **kw)
    raise ValueError(f"unknown backend {backend!r}: wgpu or cuda")


def gen(dtype: str, n: int, seed: int) -> np.ndarray:
    """The fixtures' deterministic inputs (runtime/test/fixtures.mjs): integer-exact, so equal to the JavaScript."""
    h = (np.arange(n, dtype=np.uint64) * np.uint64(2654435761) + np.uint64(seed * 40503)) & np.uint64(0xFFFFFFFF)
    if dtype == "u8":
        return (h % np.uint64(256)).astype(np.uint8)
    return ((h % np.uint64(2001)).astype(np.float64) / 1000.0 - 1.0).astype(np.float32)


class Program:
    """What both backends share: the export, its tensors, and host-side packing."""

    def __init__(self, program: dict):
        self.program = program
        self.name = program["name"]
        self.inputs = {t["name"]: t for t in program["inputs"]}
        self.outputs = {t["name"]: t for t in program["outputs"]}
        self.buffers = program["buffers"]

    def _packed(self, name: str, data) -> bytes:
        t = self.inputs.get(name)
        if t is None:
            raise KeyError(f"no input {name} in {self.name} (inputs: {', '.join(self.inputs)})")
        b = self.buffers[t["buffer"]]
        a = np.asarray(data)
        if a.size != b["elements"]:
            raise ValueError(f"input {name} holds {b['elements']} elements; got {a.size}")
        if b["dtype"] == "u8":
            if a.dtype != np.uint8:
                raise TypeError(f"input {name} is u8; got {a.dtype}")
            raw = np.ascontiguousarray(a).tobytes()
            return raw + b"\0" * (b["bytes"] - len(raw))
        return np.ascontiguousarray(a, dtype=np.float32).tobytes()

    @staticmethod
    def _constant(b: dict) -> bytes:
        return base64.b64decode(b["data"])

    def _host(self, name: str, raw) -> np.ndarray:
        t = self.outputs[name]
        n = self.buffers[t["buffer"]]["elements"]
        return np.frombuffer(raw, dtype=np.float32, count=n).reshape(t["shape"]).copy()

    def run(self, **inputs) -> dict:
        raise NotImplementedError

    def close(self) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


# ----------------------------------------------------------------------------------------------------------- wgpu
class WgpuProgram(Program):
    def __init__(self, program: dict, device=None, power_preference: str = "high-performance"):
        super().__init__(program)
        import wgpu

        self._wgpu = wgpu
        if device is None:
            adapter = wgpu.gpu.request_adapter_sync(power_preference=power_preference)
            device = adapter.request_device_sync()
        self.device = device
        why = unsupported_reason(program, lambda k: device.limits[k])
        if why:
            raise RuntimeError(f"kiln program {self.name} cannot run here: {why}")
        U = wgpu.BufferUsage
        outs = {t["buffer"] for t in program["outputs"]}
        self._bufs = []
        for b in self.buffers:
            usage = U.STORAGE | U.COPY_DST | (U.COPY_SRC if b["id"] in outs else 0)
            g = device.create_buffer(label=f"{self.name}/buffer{b['id']}", size=b["bytes"], usage=usage)
            if b.get("data"):
                device.queue.write_buffer(g, 0, self._constant(b))
            self._bufs.append(g)
        self._steps = []
        for k in program["kernels"]:
            module = device.create_shader_module(label=k["name"], code=k["wgsl"])
            pipe = device.create_compute_pipeline(label=k["name"], layout="auto", compute={"module": module, "entry_point": "main"})
            entries = [{"binding": i, "resource": {"buffer": self._bufs[bid], "offset": 0, "size": self._bufs[bid].size}} for i, bid in enumerate(k["reads"] + [k["writes"]])]
            bind = device.create_bind_group(label=k["name"], layout=pipe.get_bind_group_layout(0), entries=entries)
            self._steps.append((pipe, bind, k["dispatch"]))

    def write(self, name: str, data) -> None:
        self.device.queue.write_buffer(self._bufs[self.inputs[name]["buffer"]], 0, self._packed(name, data))

    def dispatch(self) -> None:
        enc = self.device.create_command_encoder(label=self.name)
        cp = enc.begin_compute_pass(label=self.name)
        for pipe, bind, (x, y, z) in self._steps:
            cp.set_pipeline(pipe)
            cp.set_bind_group(0, bind)
            cp.dispatch_workgroups(x, y, z)
        cp.end()
        self.device.queue.submit([enc.finish()])

    def read(self, name: str) -> np.ndarray:
        return self._host(name, self.device.queue.read_buffer(self._bufs[self.outputs[name]["buffer"]]))

    def run(self, outputs=None, **inputs) -> dict:
        for name, data in inputs.items():
            self.write(name, data)
        self.dispatch()
        return {name: self.read(name) for name in (outputs or self.outputs)}

    def close(self) -> None:
        for b in self._bufs:
            b.destroy()
        self._bufs = []


def unsupported_reason(program: dict, limit) -> str | None:
    """The first device limit the program exceeds, or None. ``limit`` maps a WebGPU limit name to its value."""
    inv = min(limit("max-compute-invocations-per-workgroup"), limit("max-compute-workgroup-size-x"))
    for k in program["kernels"]:
        if k["block"] > inv:
            return f"{k['name']}: {k['block']} threads per workgroup exceeds the device's {inv}"
        if k["smemBytes"] > limit("max-compute-workgroup-storage-size"):
            return f"{k['name']}: {k['smemBytes']} bytes of workgroup memory exceeds the device's {limit('max-compute-workgroup-storage-size')}"
        if max(k["dispatch"]) > limit("max-compute-workgroups-per-dimension"):
            return f"{k['name']}: dispatch {k['dispatch']} exceeds {limit('max-compute-workgroups-per-dimension')} per dimension"
        if len(k["reads"]) + 1 > limit("max-storage-buffers-per-shader-stage"):
            return f"{k['name']}: {len(k['reads']) + 1} storage buffers exceeds the device's {limit('max-storage-buffers-per-shader-stage')}"
    for b in program["buffers"]:
        if b["bytes"] > limit("max-storage-buffer-binding-size"):
            return f"buffer {b['id']}: {b['bytes']} bytes exceeds the binding limit {limit('max-storage-buffer-binding-size')}"
    return None


# ----------------------------------------------------------------------------------------------------------- CUDA
CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MAJOR = 75
CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MINOR = 76


def _find_library(env: str, names: list[str], globs: list[str]) -> ctypes.CDLL:
    tried = []
    for cand in ([os.environ[env]] if os.environ.get(env) else []) + names:
        try:
            return ctypes.CDLL(cand)
        except OSError:
            tried.append(cand)
    for pattern in globs:
        for cand in sorted(glob.glob(pattern), reverse=True):
            try:
                return ctypes.CDLL(cand)
            except OSError:
                tried.append(cand)
    raise OSError(f"none of {', '.join(tried) or names} could be loaded; set {env} to the library's path")


def _torch_lib_globs(stem: str) -> list[str]:
    out = []
    for p in sys.path:
        out += [f"{p}/nvidia/cuda_nvrtc/lib/{stem}*", f"{p}/nvidia/cu13/lib/{stem}*", f"{p}/torch/lib/{stem}*"]
    return out


class _Cuda:
    """The driver API and NVRTC entry points this launcher uses, with their argument types."""

    _instance = None

    @classmethod
    def get(cls) -> "_Cuda":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        c = self.cu = _find_library("KILN_LIBCUDA", ["libcuda.so.1", "libcuda.so", "nvcuda.dll"], [])
        n = self.nvrtc = _find_library("KILN_NVRTC", [ctypes.util.find_library("nvrtc") or "libnvrtc.so", "libnvrtc.so.13", "libnvrtc.so.12"], _torch_lib_globs("libnvrtc.so") + ["/usr/local/cuda/lib64/libnvrtc.so*"])
        P, I, U64, VP = ctypes.POINTER, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p
        sig = {
            "cuInit": [ctypes.c_uint], "cuDeviceGet": [P(I), I], "cuDeviceGetAttribute": [P(I), I, I],
            "cuDeviceGetName": [ctypes.c_char_p, I, I],
            "cuCtxGetCurrent": [P(VP)], "cuCtxSetCurrent": [VP], "cuCtxGetApiVersion": [VP, P(ctypes.c_uint)],
            "cuDevicePrimaryCtxRetain": [P(VP), I], "cuDevicePrimaryCtxRelease_v2": [I],
            "cuModuleLoadData": [P(VP), ctypes.c_char_p], "cuModuleGetFunction": [P(VP), VP, ctypes.c_char_p], "cuModuleUnload": [VP],
            "cuMemAlloc_v2": [P(U64), ctypes.c_size_t], "cuMemFree_v2": [U64],
            "cuMemcpyHtoD_v2": [U64, ctypes.c_void_p, ctypes.c_size_t], "cuMemcpyDtoH_v2": [ctypes.c_void_p, U64, ctypes.c_size_t],
            "cuMemsetD8_v2": [U64, ctypes.c_ubyte, ctypes.c_size_t],
            "cuLaunchKernel": [VP, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, VP, P(VP), P(VP)],
            "cuStreamSynchronize": [VP], "cuCtxSynchronize": [],
            "cuGetErrorName": [I, P(ctypes.c_char_p)], "cuGetErrorString": [I, P(ctypes.c_char_p)],
        }
        for name, args in sig.items():
            f = getattr(c, name)
            f.argtypes, f.restype = args, I
        nsig = {
            "nvrtcCreateProgram": [P(VP), ctypes.c_char_p, ctypes.c_char_p, I, VP, VP], "nvrtcDestroyProgram": [P(VP)],
            "nvrtcCompileProgram": [VP, I, P(ctypes.c_char_p)],
            "nvrtcGetProgramLogSize": [VP, P(ctypes.c_size_t)], "nvrtcGetProgramLog": [VP, ctypes.c_char_p],
            "nvrtcGetCUBINSize": [VP, P(ctypes.c_size_t)], "nvrtcGetCUBIN": [VP, ctypes.c_char_p],
            "nvrtcGetPTXSize": [VP, P(ctypes.c_size_t)], "nvrtcGetPTX": [VP, ctypes.c_char_p],
            "nvrtcVersion": [P(I), P(I)], "nvrtcGetErrorString": [I],
        }
        for name, args in nsig.items():
            f = getattr(n, name)
            f.argtypes, f.restype = args, I
        n.nvrtcGetErrorString.restype = ctypes.c_char_p
        self.check(c.cuInit(0), "cuInit")

    def check(self, r: int, what: str) -> None:
        if r != 0:
            name, text = ctypes.c_char_p(), ctypes.c_char_p()
            self.cu.cuGetErrorName(r, ctypes.byref(name))
            self.cu.cuGetErrorString(r, ctypes.byref(text))
            raise RuntimeError(f"{what}: {(name.value or b'?').decode()} ({r}): {(text.value or b'').decode()}")

    def ncheck(self, r: int, what: str) -> None:
        if r != 0:
            raise RuntimeError(f"{what}: {self.nvrtc.nvrtcGetErrorString(r).decode()} ({r})")

    def compile(self, source: str, entry: str, arch: tuple[int, int], include_paths=()) -> tuple[bytes, str]:
        """CUBIN for ``sm_XY``; PTX for ``compute_XY`` (the driver JITs it) when this NVRTC does not know the real
        architecture. Default flags, as the runner's nvcc: IEEE division and square root, FMA contraction on."""
        n, errors = self.nvrtc, []
        for kind, opt in (("cubin", f"--gpu-architecture=sm_{arch[0]}{arch[1]}"), ("ptx", f"--gpu-architecture=compute_{arch[0]}{arch[1]}")):
            prog = ctypes.c_void_p()
            self.ncheck(n.nvrtcCreateProgram(ctypes.byref(prog), source.encode(), f"{entry}.cu".encode(), 0, None, None), "nvrtcCreateProgram")
            try:
                options = [opt, *[f"--include-path={Path(p).resolve()}" for p in include_paths]]
                opts = (ctypes.c_char_p * len(options))(*[v.encode() for v in options])
                r = n.nvrtcCompileProgram(prog, len(options), opts)
                if r != 0:
                    size = ctypes.c_size_t()
                    n.nvrtcGetProgramLogSize(prog, ctypes.byref(size))
                    log = ctypes.create_string_buffer(size.value)
                    n.nvrtcGetProgramLog(prog, log)
                    errors.append(f"{opt}: {n.nvrtcGetErrorString(r).decode()}: {log.value.decode(errors='replace')[-2000:]}")
                    continue
                size = ctypes.c_size_t()
                get_size, get = (n.nvrtcGetCUBINSize, n.nvrtcGetCUBIN) if kind == "cubin" else (n.nvrtcGetPTXSize, n.nvrtcGetPTX)
                self.ncheck(get_size(prog, ctypes.byref(size)), f"nvrtcGet{kind.upper()}Size")
                image = ctypes.create_string_buffer(size.value)
                self.ncheck(get(prog, image), f"nvrtcGet{kind.upper()}")
                return image.raw, kind
            finally:
                n.nvrtcDestroyProgram(ctypes.byref(prog))
        raise RuntimeError(f"NVRTC could not compile {entry}:\n" + "\n".join(errors))


class CudaProgram(Program):
    """Kernels compiled with NVRTC for the current device, buffers allocated with cuMemAlloc. Runs in the device's
    primary context, the one the CUDA runtime (and so PyTorch) uses, so pointers from either are interchangeable; each
    program holds a reference to it until ``close``.
    ``include_paths`` explicitly supplies NVRTC header search directories (for CUDA half/bfloat16 headers). A live non-primary context current on this thread is used as found.

    ``allocate=False`` allocates only the constant buffers: the caller passes a pointer for every input and output to
    ``launch``, and one for every buffer in ``scratch`` (the intermediates between kernels). Two launches that run at the
    same time on different streams then share nothing, which one set of launcher-owned intermediates cannot offer."""

    def __init__(self, program: dict, device: int = 0, allocate: bool = True, include_paths=()):
        super().__init__(program)
        cu = self._cuda = _Cuda.get()
        d = ctypes.c_int()
        cu.check(cu.cu.cuDeviceGet(ctypes.byref(d), device), "cuDeviceGet")
        self.device = d.value
        current, primary = ctypes.c_void_p(), ctypes.c_void_p()
        cu.check(cu.cu.cuCtxGetCurrent(ctypes.byref(current)), "cuCtxGetCurrent")
        # Every program holds its own reference to the primary context. One reference shared by all the programs of a
        # thread is released by whichever closes first, which destroys the context under the others and leaves the
        # thread naming it, so the next program fails with CUDA_ERROR_CONTEXT_IS_DESTROYED.
        cu.check(cu.cu.cuDevicePrimaryCtxRetain(ctypes.byref(primary), self.device), "cuDevicePrimaryCtxRetain")
        self._retained = True
        if current.value and current.value != primary.value and cu.cu.cuCtxGetApiVersion(current, ctypes.byref(ctypes.c_uint())) == 0:
            cu.cu.cuDevicePrimaryCtxRelease_v2(self.device)    # a live context the caller created: use it as found
            self._retained = False
            self._ctx = current.value
        else:
            if current.value != primary.value:
                cu.check(cu.cu.cuCtxSetCurrent(primary), "cuCtxSetCurrent")
            self._ctx = primary.value
        major, minor = ctypes.c_int(), ctypes.c_int()
        cu.check(cu.cu.cuDeviceGetAttribute(ctypes.byref(major), CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MAJOR, self.device), "cuDeviceGetAttribute")
        cu.check(cu.cu.cuDeviceGetAttribute(ctypes.byref(minor), CU_DEVICE_ATTRIBUTE_COMPUTE_CAPABILITY_MINOR, self.device), "cuDeviceGetAttribute")
        self.arch = (major.value, minor.value)
        name = ctypes.create_string_buffer(256)
        cu.cu.cuDeviceGetName(name, 256, self.device)
        self.device_name = name.value.decode()
        io = {t["buffer"] for t in program["inputs"]} | {t["buffer"] for t in program["outputs"]}
        self.scratch = [{"id": b["id"], "bytes": b["bytes"]} for b in self.buffers if b["id"] not in io and not b.get("data")]
        self._ptrs, self._owned, self._modules, self._kernels, self.images = [None] * len(self.buffers), [], [], [], {}
        try:
            for b in self.buffers:
                if not (allocate or b.get("data")):
                    continue
                p = ctypes.c_uint64()
                cu.check(cu.cu.cuMemAlloc_v2(ctypes.byref(p), b["bytes"]), f"cuMemAlloc ({b['bytes']} bytes)")
                self._ptrs[b["id"]] = p.value
                self._owned.append(p.value)
                if b.get("data"):
                    raw = self._constant(b)
                    cu.check(cu.cu.cuMemcpyHtoD_v2(p.value, raw, len(raw)), "cuMemcpyHtoD")
            for k in program["kernels"]:
                image, kind = cu.compile(k["cuda"], k["name"], self.arch, include_paths=include_paths)
                self.images[k["name"]] = kind
                mod, fn = ctypes.c_void_p(), ctypes.c_void_p()
                cu.check(cu.cu.cuModuleLoadData(ctypes.byref(mod), image), f"cuModuleLoadData {k['name']}")
                self._modules.append(mod)
                cu.check(cu.cu.cuModuleGetFunction(ctypes.byref(fn), mod, k["name"].encode()), f"cuModuleGetFunction {k['name']}")
                self._kernels.append((fn, k))
        except Exception:
            self.close()
            raise

    def launch(self, stream: int = 0, scratch: dict[int, int] | None = None, **pointers: int) -> None:
        """Every kernel in order on ``stream``. ``pointers`` replace the launcher's own buffers for named inputs and
        outputs with device pointers the caller owns, and ``scratch`` does the same for intermediates, keyed by the
        ``id`` in ``self.scratch``; nothing is copied or synchronised. Callable from any thread: the program's context is
        made current first."""
        ptrs = list(self._ptrs)
        for name, p in pointers.items():
            t = self.inputs.get(name) or self.outputs.get(name)
            if t is None:
                raise KeyError(f"no input or output {name} in {self.name}")
            ptrs[t["buffer"]] = int(p)
        for bid, p in (scratch or {}).items():
            if bid not in {b["id"] for b in self.scratch}:
                raise KeyError(f"buffer {bid} of {self.name} is not an intermediate")
            ptrs[bid] = int(p)
        missing = [b["id"] for b in self.buffers if ptrs[b["id"]] is None]
        if missing:
            raise ValueError(f"{self.name}: no device pointer for buffer(s) {missing} (allocate=False needs every input, "
                             "output and scratch buffer)")
        cu = self._cuda.cu
        current = ctypes.c_void_p()
        self._cuda.check(cu.cuCtxGetCurrent(ctypes.byref(current)), "cuCtxGetCurrent")
        if current.value != self._ctx:
            self._cuda.check(cu.cuCtxSetCurrent(ctypes.c_void_p(self._ctx)), "cuCtxSetCurrent")
        for fn, k in self._kernels:
            vals = [ctypes.c_uint64(ptrs[b]) for b in k["reads"] + [k["writes"]]]
            args = (ctypes.c_void_p * len(vals))(*[ctypes.addressof(v) for v in vals])
            # Kiln kernels declare their shared memory statically, so the dynamic size is 0
            self._cuda.check(cu.cuLaunchKernel(fn, k["grid"], 1, 1, k["block"], 1, 1, 0, ctypes.c_void_p(stream), args, None), f"cuLaunchKernel {k['name']}")

    def _own(self, bid: int) -> int:
        if self._ptrs[bid] is None:
            raise RuntimeError(f"{self.name} was opened with allocate=False: buffer {bid} belongs to the caller")
        return self._ptrs[bid]

    def write(self, name: str, data) -> None:
        raw = self._packed(name, data)
        self._cuda.check(self._cuda.cu.cuMemcpyHtoD_v2(self._own(self.inputs[name]["buffer"]), raw, len(raw)), "cuMemcpyHtoD")

    def read(self, name: str) -> np.ndarray:
        b = self.buffers[self.outputs[name]["buffer"]]
        raw = ctypes.create_string_buffer(b["bytes"])
        self._cuda.check(self._cuda.cu.cuMemcpyDtoH_v2(raw, self._own(b["id"]), b["bytes"]), "cuMemcpyDtoH")
        return self._host(name, raw.raw)

    def run(self, outputs=None, **inputs) -> dict:
        for name, data in inputs.items():
            self.write(name, data)
        self.launch()
        self._cuda.check(self._cuda.cu.cuCtxSynchronize(), "cuCtxSynchronize")
        return {name: self.read(name) for name in (outputs or self.outputs)}

    def close(self) -> None:
        cu = self._cuda.cu
        for p in self._owned:
            cu.cuMemFree_v2(p)
        for m in self._modules:
            cu.cuModuleUnload(m)
        self._ptrs, self._owned, self._modules, self._kernels = [None] * len(self.buffers), [], [], []
        if self._retained:
            cu.cuDevicePrimaryCtxRelease_v2(self.device)
            self._retained = False


# ----------------------------------------------------------------------------------------------------------- check
def check_fixtures(directory: str, backend: str) -> int:
    """Runs every ``<case>.program.json`` in ``directory`` against its ``<case>.expect.json``; returns the failures."""
    fails = 0
    for path in sorted(Path(directory).glob("*.program.json")):
        expect = json.loads(path.with_name(path.name.replace(".program.", ".expect.")).read_text())
        p = load(path)
        t0 = time.perf_counter()
        with open_program(p, backend=backend) as prog:
            built = time.perf_counter() - t0
            ins = {t["name"]: gen(t["dtype"], int(np.prod(t["shape"])), expect["seeds"][t["name"]]).reshape(t["shape"]) for t in p["inputs"]}
            t1 = time.perf_counter()
            out = prog.run(**ins)
            first = time.perf_counter() - t1
            t2 = time.perf_counter()
            prog.run(**ins)
            second = time.perf_counter() - t2
            extra = f", {prog.device_name} sm_{prog.arch[0]}{prog.arch[1]} via {set(prog.images.values())}" if backend == "cuda" else ""
        for name, e in expect["expect"].items():
            got = out[name].reshape(-1)[np.asarray(e["indices"], dtype=np.int64)]
            want = np.asarray(e["values"], dtype=np.float64)
            d = np.abs(got.astype(np.float64) - want)
            bad = int(np.count_nonzero(~(d <= 1e-4 + 1e-3 * np.abs(want))))
            fails += bad > 0
            print(f"{'ok  ' if bad == 0 else 'FAIL'} {p['name']}.{name}: {len(want)} values, max |Δ| {d.max():.2e}, {bad} outside rtol 1e-3 / atol 1e-4; "
                  f"build {built * 1e3:.1f} ms, first run {first * 1e3:.1f} ms, second {second * 1e3:.1f} ms ({backend}{extra})")
    return fails


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Run kiln-program/1 round-trip fixtures through a backend.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="compare every fixture case with its expected outputs")
    c.add_argument("fixtures", help="directory written by runtime/test/fixtures.mjs")
    c.add_argument("--backend", default="wgpu", choices=["wgpu", "cuda"])
    a = ap.parse_args()
    sys.exit(1 if check_fixtures(a.fixtures, a.backend) else 0)
