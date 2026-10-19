import './SelectBox.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** options sharing a group render under one optgroup, in order of first appearance */
  group?: string;
}

const renderOptions = (options: SelectOption[]) =>
  options.map((o) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  ));

export const SelectBox: React.FC<{
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  id?: string;
  label?: string;
  multiple?: false;
}> = ({ value, options, onChange, id, label }) => (
  <span className="selectbox">
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.some((o) => o.group)
        ? [...new Set(options.map((o) => o.group ?? ''))].map((g) => (
            <optgroup key={g} label={g}>
              {renderOptions(options.filter((o) => (o.group ?? '') === g))}
            </optgroup>
          ))
        : renderOptions(options)}
    </select>
  </span>
);
