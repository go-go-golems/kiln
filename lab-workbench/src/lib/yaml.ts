/**
 * A small YAML emitter for displaying JSON-shaped data: block mappings and sequences, plain scalars where
 * they cannot be misread, double-quoted (JSON) strings otherwise, and literal blocks for multi-line text.
 * It never emits anchors, tags or flow collections except the empty `[]` and `{}`.
 */

const RESERVED = /^(?:true|false|null|yes|no|on|off|y|n|~|\.nan|\.inf|-\.inf)$/i;
const NUMBER_LIKE = /^[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$|^0x[0-9a-f]+$|^0o[0-7]+$/i;

/** Whether a string can be written without quotes and still read back as the same string. */
function plainSafe(s: string): boolean {
  if (s === '' || s !== s.trim()) return false;
  if (RESERVED.test(s) || NUMBER_LIKE.test(s)) return false;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return false;
  if (/: |:$| #|[\n\r\t]/.test(s)) return false;
  return true;
}

export function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : Number.isNaN(v) ? '.nan' : v > 0 ? '.inf' : '-.inf';
  if (typeof v === 'bigint') return String(v);
  const s = String(v);
  return plainSafe(s) ? s : JSON.stringify(s);
}

const isCollection = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === 'object' && v !== null;
const isEmpty = (v: Record<string, unknown> | unknown[]) => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);
const keyText = (k: string) => (plainSafe(k) ? k : JSON.stringify(k));
const multiline = (v: unknown): v is string => typeof v === 'string' && v.includes('\n');

function emit(v: unknown, indent: string): string[] {
  if (!isCollection(v) || isEmpty(v)) return [isCollection(v) ? (Array.isArray(v) ? '[]' : '{}') : yamlScalar(v)];
  const out: string[] = [];
  const child = `${indent}  `;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (multiline(item)) {
        out.push(`${indent}- |`, ...block(item, child));
      } else if (isCollection(item) && !isEmpty(item)) {
        const lines = emit(item, child);
        out.push(`${indent}- ${lines[0].slice(child.length)}`, ...lines.slice(1));
      } else {
        out.push(`${indent}- ${emit(item, child)[0]}`);
      }
    }
    return out;
  }
  for (const [k, item] of Object.entries(v)) {
    if (item === undefined) continue;
    if (multiline(item)) out.push(`${indent}${keyText(k)}: |`, ...block(item, child));
    else if (isCollection(item) && !isEmpty(item)) out.push(`${indent}${keyText(k)}:`, ...emit(item, child));
    else out.push(`${indent}${keyText(k)}: ${emit(item, child)[0]}`);
  }
  return out;
}

const block = (s: string, indent: string) => s.replace(/\n$/, '').split('\n').map((l) => (l ? `${indent}${l}` : ''));

export function toYaml(value: unknown): string {
  return emit(value, '').join('\n');
}

/** Parses a string as JSON when it is JSON; undefined otherwise (results, logs and old transcripts may be text). */
export function tryJson(s: string): { ok: true; value: unknown } | { ok: false } {
  const t = s.trim();
  if (!t || !/^[[{"\-\d]|^(?:true|false|null)$/.test(t)) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch {
    return { ok: false };
  }
}
