"""KILN-011 Phase 4: integer and float division kernels against PyTorch CUDA, on the GPU host.

Usage: python3 check_integer_division_cuda.py <dir with division-{i32,i64,f32}.json> [--report out.json]
The artifacts come from ttmp/2026/11/01/KILN-011-*/scripts/12-generate-division-programs.py.

1. Replays every output over i32 and i64 (data divisors of both signs, literal divisors 80, -3, 14, 16)
   and f32 (special values included) and requires bit-exact agreement with PyTorch CUDA (NaN == NaN).
   Signed-zero differences in float results are counted and reported, not failed.
2. Records what PyTorch CUDA and Kiln return for a zero divisor and for INT_MIN / -1 in each mode, and
   requires Kiln's INT_MIN / -1 results to equal its reference (floordiv and truncdiv wrap to INT_MIN,
   remainder and fmod give 0).
3. Compiles each kernel's CUDA to PTX with NVRTC and counts integer division instructions: a literal
   divisor kernel should contain none (NVRTC folds b == -1 and uses a multiply-high sequence).
"""
import ctypes
import json
import sys
from pathlib import Path
import torch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'runtime' / 'python'))
from runtime import TorchProgram  # noqa: E402
from kiln_launch import _Cuda  # noqa: E402

DIRECTORY = Path(sys.argv[1])
REPORT = Path(sys.argv[sys.argv.index('--report') + 1]) if '--report' in sys.argv else None
DEV = 'cuda'
N = 4096
DT = {'i32': torch.int32, 'i64': torch.int64}
report = {'format': 'kiln-011-division-cuda/1', 'device': torch.cuda.get_device_name(), 'torch': torch.__version__, 'checks': {}, 'edges': {}, 'ptx': {}}


def expected_int(a, b):
    return {'floordiv': a // b, 'remainder': a % b, 'truncdiv': torch.div(a, b, rounding_mode='trunc'), 'fmod': torch.fmod(a, b),
            'floor_lit': a // 80, 'rem_lit': a % 80, 'floor_neg': a // -3, 'rem_neg': a % -3,
            'trunc_lit': torch.div(a, 14, rounding_mode='trunc'), 'fmod_lit': torch.fmod(a, 16), 'truediv': a / b}


def compare(name, got, want):
    assert got.dtype == want.dtype, f'{name}: dtype {got.dtype} != {want.dtype}'
    if got.dtype.is_floating_point:
        same = (got == want) | (torch.isnan(got) & torch.isnan(want))
        zero_sign = int(((got == 0) & (want == 0) & (torch.signbit(got) != torch.signbit(want))).sum())
    else:
        same, zero_sign = got == want, 0
    bad = int((~same).sum())
    if bad:
        i = int((~same).nonzero()[0])
        raise AssertionError(f'{name}: {bad} mismatches, first at {i}: got {got[i].item()} want {want[i].item()}')
    return {'elements': got.numel(), 'mismatches': 0, 'zero_sign_differences': zero_sign}


torch.manual_seed(11)
for t, dtype in DT.items():
    p = TorchProgram(DIRECTORY / f'division-{t}.json')
    info = torch.iinfo(dtype)
    full = torch.randint(info.min, info.max, (N,), dtype=dtype, device=DEV)
    small = torch.randint(-1000, 1000, (N,), dtype=dtype, device=DEV)
    a = torch.where(torch.rand(N, device=DEV) < 0.5, full, small)
    b = torch.randint(-50, 50, (N,), dtype=dtype, device=DEV)
    b = torch.where(torch.rand(N, device=DEV) < 0.25, torch.randint(info.min, info.max, (N,), dtype=dtype, device=DEV), b)
    b[:8] = torch.tensor([1, -1, 2, -2, 3, -3, 80, -80], dtype=dtype)
    b[b == 0] = 7
    a[(a == info.min) & (b == -1)] = info.min + 1   # INT_MIN / -1 is checked separately below
    outs = p(a, b)
    report['checks'][t] = {name: compare(f'{t} {name}', outs[name], want) for name, want in expected_int(a, b).items()}
    # edges: zero divisors and INT_MIN / -1 (PyTorch CUDA observed, not assumed)
    a = torch.zeros(N, dtype=dtype, device=DEV); b = torch.ones(N, dtype=dtype, device=DEV)
    a[:6] = torch.tensor([info.min, info.min, 7, -7, 0, info.max], dtype=dtype); b[:6] = torch.tensor([-1, 0, 0, 0, 0, -1], dtype=dtype)
    outs = p(a, b)
    edge = {}
    for name in ['floordiv', 'remainder', 'truncdiv', 'fmod']:
        try:
            want = expected_int(a, b)[name][:6].tolist()
        except RuntimeError as error:
            want = f'{type(error).__name__}: {error}'
        edge[name] = {'inputs': list(zip(a[:6].tolist(), b[:6].tolist())), 'kiln': outs[name][:6].tolist(), 'torch_cuda': want}
    report['edges'][t] = edge
    kiln_min = {name: edge[name]['kiln'][0] for name in edge}
    assert kiln_min == {'floordiv': info.min, 'remainder': 0, 'truncdiv': info.min, 'fmod': 0}, kiln_min
    assert edge['floordiv']['kiln'][5] == -info.max and edge['remainder']['kiln'][5] == 0
    torch.cuda.synchronize(); p.close()
    print(f'PASS: {t} division kernels bit-exact versus PyTorch CUDA; edges recorded', flush=True)

p = TorchProgram(DIRECTORY / 'division-f32.json')
special = torch.tensor([0.0, -0.0, 1.0, -1.0, 0.1, -0.1, 2.0, -2.0, 7.0, -7.0, 1e30, -1e30, 1e-30, float('inf'), float('-inf'), float('nan')], device=DEV)
x = torch.randn(N, device=DEV) * 10
y = torch.randn(N, device=DEV) * 3
x[:256] = special.repeat_interleave(16); y[:256] = special.repeat(16)
i = torch.randint(-10**6, 10**6, (N,), dtype=torch.int64, device=DEV)
outs = p(x, y, i)
want = {'floordiv': x // y, 'remainder': x % y, 'fmod': torch.fmod(x, y), 'truncdiv': torch.div(x, y, rounding_mode='trunc'),
        'floor_lit': x // 2, 'mixed': i // 2.5, 'mixed_rem': i % 0.75, 'floored': torch.floor(i)}
report['checks']['f32'] = {name: compare(f'f32 {name}', outs[name], w) for name, w in want.items()}
torch.cuda.synchronize(); p.close()
print('PASS: f32 division kernels exact versus PyTorch CUDA (signed zeros reported)', flush=True)

# PTX: integer division instructions per kernel (div.s32/div.s64/rem.s32/rem.s64 and their unsigned forms)
cuda = _Cuda()
major, minor = torch.cuda.get_device_capability()
for t in ['i32', 'i64', 'f32']:
    artifact = json.loads((DIRECTORY / f'division-{t}.json').read_text())
    for kernel in artifact['kernels']:
        n, prog = cuda.nvrtc, ctypes.c_void_p()
        cuda.ncheck(n.nvrtcCreateProgram(ctypes.byref(prog), kernel['cuda'].encode(), f"{kernel['name']}.cu".encode(), 0, None, None), 'nvrtcCreateProgram')
        try:
            options = [f'--gpu-architecture=compute_{major}{minor}'.encode()]
            cuda.ncheck(n.nvrtcCompileProgram(prog, 1, (ctypes.c_char_p * 1)(*options)), f"compile {kernel['name']}")
            size = ctypes.c_size_t(); cuda.ncheck(n.nvrtcGetPTXSize(prog, ctypes.byref(size)), 'nvrtcGetPTXSize')
            image = ctypes.create_string_buffer(size.value); cuda.ncheck(n.nvrtcGetPTX(prog, image), 'nvrtcGetPTX')
        finally:
            n.nvrtcDestroyProgram(ctypes.byref(prog))
        ptx = image.value.decode()
        counts = {op: ptx.count(op) for op in ['div.s32', 'div.s64', 'rem.s32', 'rem.s64', 'div.u32', 'div.u64', 'rem.u32', 'rem.u64', 'mul.hi.s64', 'mul.hi.s32', 'mul.hi.u64', 'mul.hi.u32']}
        report['ptx'][f"{t}/{kernel['name']}"] = {k: v for k, v in counts.items() if v}
lit = {name: ops for name, ops in report['ptx'].items() if '_lit' in name or '_neg' in name}
print('PTX integer division instructions in literal-divisor kernels:', json.dumps(lit), flush=True)
if REPORT: REPORT.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report['edges'], indent=1))
