import { useRef } from 'react';
import './Splitter.css';

export interface SplitterProps {
  /** `vertical` separates side-by-side panes (drag left/right); `horizontal` stacks them (drag up/down). */
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** +1 when dragging right/down grows the pane, −1 when it shrinks it. */
  direction?: 1 | -1;
  label: string;
  onReset?: () => void;
  onToggle?: () => void;
  className?: string;
}

/**
 * A pane separator operable by pointer and keyboard: arrows resize (Shift for larger steps), Home/End jump
 * to the limits, Enter collapses the pane, double-click restores the default size.
 */
export const Splitter: React.FC<SplitterProps> = ({ orientation, value, min, max, onChange, direction = 1, label, onReset, onToggle, className }) => {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const vertical = orientation === 'vertical';
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      title={`${label} — drag or use the arrow keys; double-click resets${onToggle ? ', Enter collapses' : ''}`}
      className={['splitter', `splitter--${orientation}`, className].filter(Boolean).join(' ')}
      onPointerDown={(e) => {
        drag.current = { start: vertical ? e.clientX : e.clientY, value };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add(vertical ? 'is-resizing-x' : 'is-resizing-y');
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const delta = (vertical ? e.clientX : e.clientY) - drag.current.start;
        onChange(clamp(drag.current.value + delta * direction));
      }}
      onPointerUp={() => {
        drag.current = null;
        document.body.classList.remove('is-resizing-x', 'is-resizing-y');
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const grow = vertical ? (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (grow) {
          e.preventDefault();
          onChange(clamp(value + grow * step * direction));
        } else if (e.key === 'Home') {
          e.preventDefault();
          onChange(min);
        } else if (e.key === 'End') {
          e.preventDefault();
          onChange(max);
        } else if (e.key === 'Enter' && onToggle) {
          e.preventDefault();
          onToggle();
        }
      }}
    />
  );
};
