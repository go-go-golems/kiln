import './TextField.css';

export const TextField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  label?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}> = ({ value, onChange, placeholder, maxLength, id, label, onKeyDown }) => (
  <input
    id={id}
    aria-label={label}
    className="textfield"
    type="text"
    value={value}
    placeholder={placeholder}
    maxLength={maxLength}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={onKeyDown}
  />
);
