// The example programs' texts, read from packages/lab/presets/ (Node only).
import { readFileSync } from 'node:fs';
import { PRESET_INFO, type Preset } from '../presets.ts';

/** The directory holding the preset programs. */
export const PRESETS_DIR = new URL('../../presets/', import.meta.url);

const read = (file: string) => readFileSync(new URL(file, PRESETS_DIR), 'utf8');

/** Every preset with its source and scripted replies. */
export const readPresets = (): Preset[] =>
  PRESET_INFO.map((p) => ({ ...p, source: read(p.file), replies: p.repliesFile ? read(p.repliesFile) : '' }));

/** One preset by id; throws for an unknown id. */
export function readPreset(id: string): Preset {
  const p = PRESET_INFO.find((x) => x.id === id);
  if (!p) throw new Error(`unknown preset "${id}" (known: ${PRESET_INFO.map((x) => x.id).join(', ')})`);
  return { ...p, source: read(p.file), replies: p.repliesFile ? read(p.repliesFile) : '' };
}
