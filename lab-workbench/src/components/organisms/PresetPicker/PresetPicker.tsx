import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Icon } from '@/components/atoms/Icon';
import { Meter } from '@/components/atoms/Meter';
import { PRESETS, presetById } from '@/presets';
import './PresetPicker.css';

/** A grouped listbox of preset programs: arrow keys move, Enter opens, Escape closes. */
export const PresetPicker: React.FC<{ labId: string }> = ({ labId }) => {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(Math.max(0, PRESETS.findIndex((p) => p.id === labId)));
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const current = presetById(labId);
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);
  const choose = (i: number) => {
    setOpen(false);
    nav(`/labs/${PRESETS[i].id}`);
  };
  let lastGroup = '';
  return (
    <div className="picker">
      <button type="button" className="picker__button" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen((o) => !o)}>
        <Eyebrow>Preset · {current?.group ?? 'custom'}</Eyebrow>
        <span className="picker__name">{current?.name ?? labId}</span>
        <Icon name="chevronDown" />
      </button>
      {open ? (
        <ul
          id={`${id}-list`}
          ref={list}
          className="picker__list"
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${cursor}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setCursor((c) => Math.min(PRESETS.length - 1, c + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setCursor((c) => Math.max(0, c - 1)));
            else if (e.key === 'Enter') (e.preventDefault(), choose(cursor));
            else if (e.key === 'Escape') setOpen(false);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
          }}
        >
          {PRESETS.map((p, i) => {
            const head = p.group !== lastGroup ? p.group : null;
            lastGroup = p.group;
            return (
              <li key={p.id} role="presentation">
                {head ? <div className="picker__group">{head}</div> : null}
                <div
                  id={`${id}-opt-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={p.id === labId}
                  className={`picker__opt${i === cursor ? ' is-cursor' : ''}${p.id === labId ? ' is-current' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                >
                  <span className="picker__num num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="picker__body">
                    <span className="picker__optname">{p.name}</span>
                    <span className="picker__desc">{p.description}</span>
                  </span>
                  <Meter value={p.complexity} label="complexity" />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
