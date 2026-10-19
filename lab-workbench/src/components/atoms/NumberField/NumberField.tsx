import './NumberField.css';

export const NumberField: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  label?: string;
}> = ({ value, onChange, min, max, step = 1, id, label }) => (
  <input
    id={id}
    aria-label={label}
    className="numfield"
    type="number"
    value={Number.isFinite(value) ? value : ''}
    min={min}
    max={max}
    step={step}
    onChange={(e) => {
      const v = e.target.valueAsNumber;
      if (Number.isFinite(v)) onChange(v);
    }}
  />
);
