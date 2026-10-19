import './RangeSlider.css';

export interface RangeSliderProps {
  value: [number, number];
  min: number;
  max: number;
  step?: number;
  onChange: (v: [number, number]) => void;
  label?: string;
}

/** Two thumbs on one track; each thumb is a real range input with its own label. */
export const RangeSlider: React.FC<RangeSliderProps> = ({ value, min, max, step = 1, onChange, label }) => {
  const [lo, hi] = value;
  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <div className="range" style={{ '--lo': `${pct(lo)}%`, '--hi': `${pct(hi)}%` } as React.CSSProperties}>
      <div className="range__track" />
      <input
        type="range"
        aria-label={`${label ?? 'range'} lower bound`}
        min={min}
        max={max}
        step={step}
        value={lo}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
      />
      <input
        type="range"
        aria-label={`${label ?? 'range'} upper bound`}
        min={min}
        max={max}
        step={step}
        value={hi}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
      />
    </div>
  );
};
