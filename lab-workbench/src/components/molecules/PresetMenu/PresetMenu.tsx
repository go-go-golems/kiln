import { SelectBox } from '@/components/atoms/SelectBox';

/** Named partial parameter assignments declared with b.preset(). */
export const PresetMenu: React.FC<{ presets: { name: string }[]; onApply: (name: string) => void }> = ({ presets, onApply }) =>
  presets.length ? (
    <SelectBox
      label="Apply a parameter preset"
      value=""
      options={[{ value: '', label: 'Presets…', disabled: true }, ...presets.map((p) => ({ value: p.name, label: p.name }))]}
      onChange={(v) => v && onApply(v)}
    />
  ) : null;
