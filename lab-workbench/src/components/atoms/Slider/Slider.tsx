import './Slider.css';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  id?: string;
  label?: string;
  scale?: 'linear' | 'log';
}

const toPos = (v: number, min: number, max: number, log: boolean) =>
  log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (v - min) / (max - min);
const fromPos = (p: number, min: number, max: number, log: boolean) =>
  log ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))) : min + p * (max - min);

export const Slider: React.FC<SliderProps> = ({ value, min, max, step = 1, onChange, id, label, scale = 'linear' }) => {
  const log = scale === 'log' && min > 0;
  if (log) {
    const pos = toPos(value, min, max, true);
    return (
      <input
        id={id}
        aria-label={label}
        className="slider"
        type="range"
        min={0}
        max={1000}
        value={Math.round(pos * 1000)}
        onChange={(e) => {
          const v = fromPos(Number(e.target.value) / 1000, min, max, true);
          onChange(Math.round(v / step) * step);
        }}
      />
    );
  }
  return (
    <input
      id={id}
      aria-label={label}
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--pos': `${toPos(value, min, max, false) * 100}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
};
