import { useMemo, useState } from 'react';
import { Segmented } from '@/components/atoms/Segmented';
import { CodeBlock } from '@/components/molecules/CodeBlock';
import { toYaml, tryJson } from '@/lib/yaml';

type Format = 'yaml' | 'json';
const STORAGE_KEY = 'perf-lab:data-format';

/** The reader's last choice is the default for the next block (a per-viewer convenience). */
const preferred = (): Format => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'json' ? 'json' : 'yaml';
  } catch {
    return 'yaml';
  }
};

/**
 * Structured data shown as highlighted YAML, with a toggle to the raw JSON and a copy button that copies the
 * format in view. Text that is not JSON is shown as text.
 */
export const DataBlock: React.FC<{
  /** the data itself, or */
  value?: unknown;
  /** its JSON text (results and stored transcripts carry text) */
  text?: string;
  label?: React.ReactNode;
  maxHeight?: number;
  className?: string;
}> = ({ value, text, label, maxHeight, className }) => {
  const [format, setFormat] = useState<Format>(preferred);
  const data = useMemo(() => {
    if (value !== undefined) return { ok: true as const, value };
    if (text === undefined) return { ok: true as const, value: undefined };
    return tryJson(text);
  }, [value, text]);
  const shown = useMemo(() => {
    if (!data.ok) return { code: text ?? '', lang: 'text' as const };
    return format === 'yaml' ? { code: toYaml(data.value), lang: 'yaml' as const } : { code: JSON.stringify(data.value, null, 2) ?? 'undefined', lang: 'json' as const };
  }, [data, format, text]);
  const choose = (f: Format) => {
    setFormat(f);
    try {
      localStorage.setItem(STORAGE_KEY, f);
    } catch {
      // the choice applies to this block only
    }
  };
  return (
    <CodeBlock
      className={className}
      code={shown.code}
      lang={shown.lang}
      label={label}
      maxHeight={maxHeight}
      controls={
        data.ok ? (
          <Segmented
            size="sm"
            label="Data format"
            value={format}
            onChange={(v) => choose(v as Format)}
            options={[
              { value: 'yaml', label: 'YAML' },
              { value: 'json', label: 'JSON' },
            ]}
          />
        ) : null
      }
    />
  );
};
