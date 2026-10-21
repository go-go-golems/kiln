// Capture identity (guide §21.1): everything that can change a measurement, and nothing that cannot. The host's name
// is absent on purpose: renaming a host must not change what was measured, and the device and environment say where.
import { canonicalJSON, sha256Hex } from '@kiln/evidence';
import type { EnvironmentBlock, Protocol } from './model.ts';

export const CAPTURE_FORMAT = 'kiln-capture/1';

export function captureId(c: { kind: string; contentId: string; collectors: readonly string[]; protocol: Protocol; device: string; environment: EnvironmentBlock }): string {
  return sha256Hex(canonicalJSON({
    format: CAPTURE_FORMAT,
    kind: c.kind,
    content: c.contentId,
    collectors: [...c.collectors].sort(),
    protocol: { reps: c.protocol.reps, launches: c.protocol.launches, warmup: c.protocol.warmup, seed: c.protocol.seed },
    device: c.device,
    environment: c.environment,
  }));
}

/**
 * The device a capture is measured on, as identity sees it: the GPU's UUID from the probe, or on a host without a
 * GPU its CPU (architecture, model and logical cores), so that two machines' CPU captures are two identities.
 */
export const deviceKey = (gpu: { uuid: string } | undefined, host: { arch: string; cpu?: { model: string | null; cores: number | null } }): string =>
  gpu ? `gpu:${gpu.uuid}` : `cpu:${host.arch}:${host.cpu?.model ?? 'unknown'}:${host.cpu?.cores ?? '?'}`;
