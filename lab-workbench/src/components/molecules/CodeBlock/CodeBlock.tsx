import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/atoms/IconButton';
import { highlightJs, highlightJson, highlightYaml } from '@/lib/highlight';
import './CodeBlock.css';

export type CodeLang = 'js' | 'yaml' | 'json' | 'text';

const HIGHLIGHT: Record<CodeLang, (s: string) => React.ReactNode[]> = {
  js: highlightJs,
  yaml: highlightYaml,
  json: highlightJson,
  text: (s) => [s],
};

/** Copies text and shows a check for a moment; says so when the clipboard is unavailable. */
export function useCopy() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1400);
  };
  return { state, copy };
}

export const CopyButton: React.FC<{ text: string; what?: string }> = ({ text, what = 'code' }) => {
  const { state, copy } = useCopy();
  return (
    <IconButton
      size="sm"
      icon={state === 'copied' ? 'check' : 'copy'}
      label={state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: clipboard unavailable' : `Copy ${what}`}
      onClick={() => void copy(text)}
    />
  );
};

/** Highlighted, scrollable code with a header: a label, optional controls and a copy button. */
export const CodeBlock: React.FC<{
  code: string;
  lang: CodeLang;
  label?: React.ReactNode;
  controls?: React.ReactNode;
  /** text to copy when it differs from what is shown */
  copyText?: string;
  maxHeight?: number;
  className?: string;
}> = ({ code, lang, label, controls, copyText, maxHeight = 360, className }) => {
  const nodes = useMemo(() => HIGHLIGHT[lang](code), [code, lang]);
  return (
    <div className={['codeblock', className].filter(Boolean).join(' ')}>
      <div className="codeblock__head">
        <span className="codeblock__label mono">{label ?? lang}</span>
        <span className="codeblock__tools">
          {controls}
          <CopyButton text={copyText ?? code} what={lang === 'js' ? 'code' : lang} />
        </span>
      </div>
      <pre className="codeblock__body mono" style={{ maxHeight }} tabIndex={0}>
        <code>{nodes}</code>
      </pre>
    </div>
  );
};
