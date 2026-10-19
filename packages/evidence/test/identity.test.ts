import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../src/canonical.ts';
import { canonicalSource, contentId, cudaDevice, deviceId, slug, type ContentIdInput } from '../src/identity.ts';
import { sha256Hex } from '../src/sha256.ts';

const spec = { id: 'rtx5090', sms: 170, l2: 96 << 20 };
const base = (): ContentIdInput => ({
  codegen: 'kiln-codegen/1',
  lang: 'sim',
  sourceSha256: sha256Hex('loop.kernel k_ew(x) …'),
  launch: { grid: 16384, block: 256, smem: 0 },
  inputs: [{ shape: [4194304], seed: 12345 }],
  output: [4194304],
  target: sha256Hex(canonicalJSON(spec)),
});

describe('contentId', () => {
  it('is the sha256 of the canonical material in guide §22', () => {
    const k = base();
    const material = canonicalJSON({ codegen: k.codegen, lang: k.lang, source: k.sourceSha256, launch: k.launch, inputs: k.inputs, output: k.output, target: k.target });
    expect(contentId(k)).toBe(sha256Hex(material));
  });

  it('changes when anything that affects execution changes', () => {
    const id = contentId(base());
    const variants: Array<Partial<ContentIdInput>> = [
      { codegen: 'kiln-codegen/2' },
      { sourceSha256: sha256Hex('other source') },
      { launch: { grid: 16384, block: 128, smem: 0 } },
      { launch: { grid: 16384, block: 256, smem: 1024 } },
      { inputs: [{ shape: [4194304], seed: 12346 }] },
      { inputs: [{ shape: [2097152, 2], seed: 12345 }] },
      { output: [4194303] },
      { target: sha256Hex(canonicalJSON({ ...spec, sms: 128 })) },
      { lang: 'cuda', target: null },
    ];
    const ids = variants.map((v) => contentId({ ...base(), ...v }));
    for (const other of ids) expect(other).not.toBe(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not depend on key order', () => {
    const k = base();
    const shuffled = { target: k.target, output: k.output, inputs: k.inputs, launch: { smem: 0, block: 256, grid: 16384 }, sourceSha256: k.sourceSha256, lang: k.lang, codegen: k.codegen } as ContentIdInput;
    expect(contentId(shuffled)).toBe(contentId(k));
  });

  it.each([
    ['empty codegen', { codegen: '' }],
    ['unknown lang', { lang: 'ptx' as 'cuda' }],
    ['source not a digest', { sourceSha256: 'abc' }],
    ['fractional block', { launch: { grid: 1, block: 1.5, smem: 0 } }],
    ['negative grid', { launch: { grid: -1, block: 1, smem: 0 } }],
    ['bad input shape', { inputs: [{ shape: [2, -1], seed: 1 }] }],
    ['bad seed', { inputs: [{ shape: [2], seed: Number.NaN }] }],
    ['sim without target', { target: null }],
    ['cuda with target', { lang: 'cuda' as const }],
  ])('refuses %s', (_name, patch) => {
    expect(() => contentId({ ...base(), ...patch } as ContentIdInput)).toThrow(TypeError);
  });
});

describe('canonicalSource', () => {
  it('replaces the entry symbol, whole words only', () => {
    const a = 'extern "C" __global__ void k_ew(const float* src0, float* dst) { /* k_ew */ k_ew_2(); }';
    expect(canonicalSource(a, 'k_ew')).toBe('extern "C" __global__ void kernel(const float* src0, float* dst) { /* kernel */ k_ew_2(); }');
  });
  it('makes two kernels that differ only in name hash alike', () => {
    const src = (name: string) => `__global__ void ${name}(float* dst) { dst[0] = 1.0f; }`;
    expect(sha256Hex(canonicalSource(src('k_gelu_3'), 'k_gelu_3'))).toBe(sha256Hex(canonicalSource(src('k_gelu_8'), 'k_gelu_8')));
  });
  it('refuses a symbol that is not an identifier', () => {
    expect(() => canonicalSource('x', 'a.b')).toThrow(TypeError);
    expect(() => canonicalSource('x', '')).toThrow(TypeError);
  });
});

describe('deviceId', () => {
  const fp = { vendor: 'apple', architecture: 'metal-3', device: '', description: 'Apple M3 Max', timestamps: true, userAgent: 'Chrome/141' };

  it('is <class>:<slug>-<8 hex of the fingerprint hash> for real devices', () => {
    const id = deviceId('webgpu', 'Apple M3 Max (Metal 3)', fp);
    expect(id).toBe(`webgpu:apple-m3-max-metal-3-${sha256Hex(canonicalJSON(fp)).slice(0, 8)}`);
    expect(id).toMatch(/^webgpu:[a-z0-9-]+-[0-9a-f]{8}$/);
  });

  it('separates devices whose fingerprints differ, and only those', () => {
    const a = deviceId('webgpu', 'Apple M3 Max', fp);
    expect(deviceId('webgpu', 'Apple M3 Max', { ...fp, timestamps: false })).not.toBe(a);
    expect(deviceId('webgpu', 'Apple M3 Max', { userAgent: fp.userAgent, timestamps: true, description: fp.description, device: '', architecture: fp.architecture, vendor: fp.vendor })).toBe(a);
    expect(deviceId('cuda', 'NVIDIA GeForce RTX 4090', { name: 'NVIDIA GeForce RTX 4090', cc: '8.9', driver: '575.57', host: 'a' }))
      .not.toBe(deviceId('cuda', 'NVIDIA GeForce RTX 4090', { name: 'NVIDIA GeForce RTX 4090', cc: '8.9', driver: '575.57', host: 'b' }));
  });

  it('keeps simulator ids as they were', () => {
    expect(deviceId('sim', 'rtx5090', { spec: sha256Hex('x'), name: 'RTX 5090' })).toBe('sim:rtx5090');
  });

  it('refuses unknown classes, empty names and nested fingerprints', () => {
    expect(() => deviceId('tpu' as 'sim', 'x', {})).toThrow(TypeError);
    expect(() => deviceId('cuda', ' ', {})).toThrow(TypeError);
    expect(() => deviceId('cuda', 'x', { clocks: { sm: 1 } } as unknown as Record<string, string>)).toThrow(TypeError);
    expect(() => deviceId('cuda', 'x', { mhz: Number.NaN })).toThrow(TypeError);
  });

  it('slug', () => {
    expect(slug('NVIDIA GeForce RTX 4090')).toBe('nvidia-geforce-rtx-4090');
    expect(slug('  Café  Ünïcode__x ')).toBe('cafe-unicode-x');
    expect(slug('***')).toBe('device');
    expect(slug('a'.repeat(100)).length).toBe(48);
  });
});

describe('cudaDevice', () => {
  const report = { name: 'NVIDIA RTX PRO 6000', cc: '12.0', sms: 188, pciBusId: '0000:01:00.0', gpuUuid: 'GPU-1234', nested: { x: 1 }, hostname: 'playback-rtx-dev' };

  it('does not depend on the route that reached the GPU', () => {
    const viaSsh = cudaDevice(report, 'playback@playback-rtx-dev'), viaPage = cudaDevice(report, 'http://localhost:8765'), viaFile = cudaDevice(report, 'import');
    expect(viaPage.id).toBe(viaSsh.id);
    expect(viaFile.id).toBe(viaSsh.id);
    expect(viaSsh.id).toMatch(/^cuda:nvidia-rtx-pro-6000-[0-9a-f]{8}$/);
    expect(viaSsh).toMatchObject({ name: 'CUDA NVIDIA RTX PRO 6000' });
    expect(viaSsh.fingerprint).not.toHaveProperty('nested');
    expect(viaSsh.fingerprint).not.toHaveProperty('host');
  });

  it('falls back to the given host for runners that predate hostname', () => {
    const { hostname: _, ...old } = report;
    expect(cudaDevice(old, 'a').fingerprint.host).toBe('a');
    expect(cudaDevice(old, 'a').id).not.toBe(cudaDevice(old, 'b').id);
  });

  it('separates two GPUs of one model on one host by their UUID', () => {
    expect(cudaDevice({ ...report, gpuUuid: 'GPU-5678' }, 'x').id).not.toBe(cudaDevice(report, 'x').id);
  });
});
