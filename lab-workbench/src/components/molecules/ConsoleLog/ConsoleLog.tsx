import { useEffect, useRef } from 'react';
import type { ConsoleLine } from '@/features/ui/uiSlice';
import './ConsoleLog.css';

const time = (t: number) => new Date(t).toTimeString().slice(0, 8);

export const ConsoleLog: React.FC<{ lines: ConsoleLine[]; onLine?: (line: number) => void }> = ({ lines, onLine }) => {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView may return a promise in current browsers; an effect must not return it
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  return (
    <div className="console" role="log" aria-live="polite">
      {lines.map((l) => (
        <div key={l.id} className={`console__line console__line--${l.level}`}>
          <span className="console__time">{time(l.at)}</span>
          {l.line && onLine ? (
            <button type="button" className="console__jump" onClick={() => onLine(l.line!)}>
              {l.text}
            </button>
          ) : (
            <span>{l.text}</span>
          )}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
};
