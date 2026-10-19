import './Meter.css';

/** Five-step meter (complexity), or a proportional bar with a value label. */
export const Meter: React.FC<{ value: number; max?: number; steps?: boolean; label: string; tone?: 'ink' | 'warn' | 'bad' | 'ok' }> = ({
  value,
  max = 5,
  steps = true,
  label,
  tone = 'ink',
}) =>
  steps ? (
    <span className="meter meter--steps" role="img" aria-label={`${label}: ${value} of ${max}`} title={`${label}: ${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  ) : (
    <span className={`meter meter--bar meter--${tone}`} role="img" aria-label={`${label}: ${Math.round((value / max) * 100)} %`} title={`${label}: ${Math.round((value / max) * 100)} %`}>
      <span style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />
    </span>
  );
