import { isValue, type Prov, type Value } from '@/lang/values';
import { fmtBytes, fmtNumber } from '@/lang/util';

export interface Formatted {
  text: string;
  prov: Prov;
  missing: boolean;
  reason?: string;
  unit?: string;
  title: string;
}

const BYTE_UNITS = new Set(['B', 'bytes']);

export function formatScalar(v: unknown, unit?: string): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (unit && BYTE_UNITS.has(unit)) return fmtBytes(v);
    const n = fmtNumber(v, Math.abs(v) < 10 ? 3 : 4);
    return unit ? `${n} ${unit}` : n;
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length > 8 ? `[${v.slice(0, 8).map((x) => formatScalar(x)).join(', ')}, …]` : `[${v.map((x) => formatScalar(x)).join(', ')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.ref === 'string') return String(o.id ?? o.ref);
    return JSON.stringify(v);
  }
  return String(v);
}

/** One formatting rule for every cell: missing is "—" with its reason, never zero. */
export function formatValue(x: unknown, fieldUnit?: string): Formatted {
  if (isValue(x)) {
    const v = x as Value;
    const unit = v.unit ?? fieldUnit;
    const missing = v.value === null;
    const text = missing ? '—' : formatScalar(v.value, unit);
    const parts = [
      missing ? `MISSING · ${v.reason ?? 'no reason recorded'}` : v.prov.toUpperCase(),
      v.metric,
      v.method,
      v.scope ? `scope: ${v.scope}` : undefined,
      v.denominator ? `denominator: ${v.denominator}` : undefined,
      v.source ? `source: ${v.source}` : undefined,
    ].filter(Boolean);
    return { text, prov: v.prov, missing, reason: v.reason, unit, title: parts.join('\n') };
  }
  const missing = x === null || x === undefined;
  return { text: formatScalar(x, fieldUnit), prov: 'observed', missing, unit: fieldUnit, title: missing ? 'MISSING' : 'OBSERVED' };
}

export const SERIES_FIXED: Record<string, string> = {
  candidate: 'var(--d-candidate)',
  baseline: 'var(--d-baseline)',
};
const PALETTE = ['var(--d1)', 'var(--d2)', 'var(--d3)', 'var(--d4)', 'var(--d5)', 'var(--d6)'];

/** The light ground under a series' stipple: the series colour mixed into the sheet. */
export const tintOf = (color: string) => `color-mix(in oklab, ${color} var(--stipple-tint), var(--sheet))`;

export function seriesColor(key: string, index: number): string {
  return SERIES_FIXED[key] ?? PALETTE[index % PALETTE.length];
}

export const PROV_GLYPH: Record<Prov, string> = {
  observed: '●',
  derived: '◐',
  heuristic: '◌',
  illustrative: '◇',
  unknown: '▨',
};

const FULL_SHA: Record<string, string> = {
  d59d9ad0: 'd59d9ad0154331795d083afcddae5cbadf2535a0',
  a6f14d94: 'a6f14d94720cf052045b6d79467ecd37653eecaf',
  '3496baed': '3496baeda030c7f24fd88ce013ecf0d38e4a17cf',
  '488d9f41': '488d9f41e25af75461b7ba8e3b0da0c29765c355',
};

/** `rev:path#symbol` → pinned GitHub URL when the revision is one of the ticket's pinned revisions. */
export function sourceLink(ref: string): { rev: string; path: string; symbol?: string; url?: string } {
  const [revPath, symbol] = ref.split('#');
  const i = revPath.indexOf(':');
  const rev = i >= 0 ? revPath.slice(0, i) : '';
  const path = i >= 0 ? revPath.slice(i + 1) : revPath;
  const sha = FULL_SHA[rev];
  const url = sha ? `https://github.com/tulip/playback/blob/${sha}/${path}` : rev === 'pytorch' ? `https://github.com/pytorch/pytorch/blob/main/${path}` : undefined;
  return { rev, path, symbol, url };
}

/** Plan estimates are host time: GPU-minutes on a GPU host, plain minutes on this machine's CPU. */
export const minutesUnit = (hosts: string | string[]) => ([hosts].flat().join(', ').split(', ').every((h) => h === 'local') ? 'min' : 'gpu-min');
