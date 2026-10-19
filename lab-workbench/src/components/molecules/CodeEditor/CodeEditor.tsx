import { useMemo, useRef } from 'react';
import { highlightJs as highlight } from '@/lib/highlight';
import './CodeEditor.css';

/** A plain textarea with a highlighted mirror underneath, line numbers and an error-line marker. */
export const CodeEditor: React.FC<{
  value: string;
  onChange: (v: string) => void;
  errorLine?: number;
  label: string;
  readOnly?: boolean;
  onSubmit?: () => void;
}> = ({ value, onChange, errorLine, label, readOnly, onSubmit }) => {
  const pre = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split('\n').length, [value]);
  const highlighted = useMemo(() => highlight(value), [value]);
  return (
    <div className="code">
      <div className="code__gutter" ref={gutter} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? 'is-error' : ''}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="code__body">
        <pre ref={pre} className="code__mirror" aria-hidden>
          {highlighted}
          {'\n'}
        </pre>
        <textarea
          aria-label={label}
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (pre.current) {
              pre.current.scrollTop = e.currentTarget.scrollTop;
              pre.current.scrollLeft = e.currentTarget.scrollLeft;
            }
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmit?.();
            }
            if (e.key === 'Tab' && !e.shiftKey && !readOnly) {
              e.preventDefault();
              const t = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = t;
              const next = `${value.slice(0, a)}  ${value.slice(b)}`;
              onChange(next);
              requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
            }
          }}
        />
      </div>
    </div>
  );
};
