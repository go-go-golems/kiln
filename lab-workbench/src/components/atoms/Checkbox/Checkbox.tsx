import './Checkbox.css';

export const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }> = ({ checked, onChange, label, id }) => (
  <label className="check" htmlFor={id}>
    <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);
