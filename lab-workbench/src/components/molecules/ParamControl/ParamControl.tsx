import { useId } from 'react';
import { BindingBadge } from '@/components/atoms/BindingBadge';
import { Checkbox } from '@/components/atoms/Checkbox';
import { IconButton } from '@/components/atoms/IconButton';
import { NumberField } from '@/components/atoms/NumberField';
import { RangeSlider } from '@/components/atoms/RangeSlider';
import { Segmented } from '@/components/atoms/Segmented';
import { SelectBox } from '@/components/atoms/SelectBox';
import { Slider } from '@/components/atoms/Slider';
import { TextField } from '@/components/atoms/TextField';
import type { ParamSummary } from '@/lang/ir';
import type { OptionItem } from '@/lang/params';
import './ParamControl.css';

export interface RunOption {
  ref: string;
  label: string;
  valid: boolean;
}

export interface ParamControlProps {
  p: ParamSummary;
  value: unknown;
  options: OptionItem[] | null;
  runs?: RunOption[];
  pending: boolean;
  onChange: (v: unknown) => void;
  onReset: () => void;
}

const fmt = (p: ParamSummary, v: unknown) => {
  const unit = p.unit ? ` ${p.unit}` : '';
  if (Array.isArray(v) && p.control === 'range') return `${v[0]}–${v[1]}${unit}`;
  if (typeof v === 'number') return `${Number.isInteger(v) ? v : +v.toFixed(4)}${unit}`;
  return v === null || v === undefined ? '—' : `${String(v)}${unit}`;
};

/** One declared parameter: label, unit, binding badge, the control for its kind, and a reset. */
export const ParamControl: React.FC<ParamControlProps> = ({ p, value, options, runs, pending, onChange, onReset }) => {
  const id = useId();
  const c = p.constraints;
  const differs = JSON.stringify(value) !== JSON.stringify(p.defaultValue);
  const unavailable = options && ['toggle', 'select', 'radio'].includes(p.control) && !options.some((o) => o.value === value);
  let control: React.ReactNode;
  switch (p.control) {
    case 'slider':
      control = (
        <>
          <Slider id={id} value={Number(value)} min={c.min ?? 0} max={c.max ?? 1} step={c.step} scale={c.scale as 'linear' | 'log'} onChange={onChange} />
          <output htmlFor={id} className="param__readout num">{fmt(p, value)}</output>
        </>
      );
      break;
    case 'range':
      control = (
        <>
          <RangeSlider label={p.label} value={value as [number, number]} min={c.min ?? 0} max={c.max ?? 1} step={c.step} onChange={onChange} />
          <output className="param__readout num">{fmt(p, value)}</output>
        </>
      );
      break;
    case 'number':
      control = <NumberField id={id} value={Number(value)} min={c.min} max={c.max} step={c.step} onChange={onChange} />;
      break;
    case 'seed':
      control = (
        <>
          <NumberField id={id} value={Number(value)} min={0} step={1} onChange={onChange} />
          <IconButton size="sm" icon="reset" label="Draw a new seed" onClick={() => onChange(Math.floor(Math.random() * 2 ** 31))} />
        </>
      );
      break;
    case 'checkbox':
      control = <Checkbox id={id} checked={Boolean(value)} onChange={onChange} label={value ? 'on' : 'off'} />;
      break;
    case 'toggle':
      control = (
        <Segmented
          label={p.label}
          size="sm"
          value={value}
          options={(options ?? []).map((o) => ({ value: o.value, label: o.label, disabled: o.disabled }))}
          onChange={onChange}
        />
      );
      break;
    case 'select':
      control = (
        <SelectBox
          id={id}
          value={String(value)}
          options={[
            ...(unavailable ? [{ value: String(value), label: `${String(value)} (unavailable)`, disabled: true }] : []),
            ...(options ?? []).map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled })),
          ]}
          onChange={(s) => onChange(options?.find((o) => String(o.value) === s)?.value ?? s)}
        />
      );
      break;
    case 'radio':
      control = (
        <div className="param__radio" role="radiogroup" aria-labelledby={`${id}-label`}>
          {(options ?? []).map((o) => (
            <label key={String(o.value)}>
              <input type="radio" name={id} checked={o.value === value} onChange={() => onChange(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
      break;
    case 'multiselect': {
      const list = Array.isArray(value) ? value : [];
      control = (
        <div className="param__multi" role="group" aria-labelledby={`${id}-label`}>
          {(options ?? []).map((o) => (
            <Checkbox
              key={String(o.value)}
              label={o.label}
              checked={list.includes(o.value)}
              onChange={(on) => onChange(on ? [...list, o.value] : list.filter((x) => x !== o.value))}
            />
          ))}
        </div>
      );
      break;
    }
    case 'text':
      control = <TextField id={id} value={String(value ?? '')} placeholder={c.placeholder} maxLength={c.maxLength} onChange={onChange} />;
      break;
    case 'pickRun':
      control = (
        <SelectBox
          id={id}
          value={String(value ?? '')}
          options={[
            ...(runs && !runs.some((r) => r.ref === value) ? [{ value: String(value ?? ''), label: `${String(value ?? 'none')} (not imported)`, disabled: true }] : []),
            ...(runs ?? []).map((r) => ({ value: r.ref, label: `${r.valid ? '' : '✕ '}${r.label}` })),
          ]}
          onChange={onChange}
        />
      );
      break;
    default:
      control = <span className="muted">{p.control}</span>;
  }
  return (
    <div className={`param param--${p.control}${pending ? ' is-pending' : ''}`}>
      <div className="param__head">
        <label id={`${id}-label`} htmlFor={id} className="param__label" title={p.help ?? `${p.urlKey} · ${p.control}`}>
          {p.label}
          {p.unit && !['slider', 'range'].includes(p.control) ? <span className="param__unit"> · {p.unit}</span> : null}
        </label>
        <BindingBadge binding={p.binding} pending={pending} />
        {differs ? <IconButton size="sm" icon="reset" label={`Reset ${p.label} to its default`} onClick={onReset} /> : null}
      </div>
      <div className="param__control">{control}</div>
    </div>
  );
};
