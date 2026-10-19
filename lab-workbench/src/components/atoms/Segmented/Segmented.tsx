import './Segmented.css';

export interface SegmentedOption {
  value: string | number | boolean;
  label: string;
  disabled?: boolean;
}

export const Segmented: React.FC<{
  options: SegmentedOption[];
  value: unknown;
  onChange: (v: SegmentedOption['value']) => void;
  label?: string;
  size?: 'sm' | 'md';
}> = ({ options, value, onChange, label, size = 'md' }) => {
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next && !next.disabled) onChange(next.value);
  };
  return (
    <div
      className={`seg seg--${size}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(1));
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(-1));
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={on ? 'is-on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
