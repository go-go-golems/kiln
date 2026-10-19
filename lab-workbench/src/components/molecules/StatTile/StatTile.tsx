import { Eyebrow } from '@/components/atoms/Eyebrow';
import { ProvenanceGlyph } from '@/components/atoms/ProvenanceGlyph';
import { formatValue } from '@/lib/format';
import { isValue } from '@/lang/values';
import './StatTile.css';

/** A display figure with its label, provenance and (for estimates) interval and method. */
export const StatTile: React.FC<{ value: unknown; label: string; footer?: string; interval?: [unknown, unknown]; level?: number }> = ({
  value,
  label,
  footer,
  interval,
  level,
}) => {
  const f = formatValue(value);
  const lo = interval ? formatValue(interval[0]) : null;
  const hi = interval ? formatValue(interval[1]) : null;
  return (
    <div className={`stat${f.missing ? ' is-missing' : ''}`} title={f.title}>
      <div className="stat__figure">
        <span className="stat__value">{f.text}</span>
        {isValue(value) ? <ProvenanceGlyph prov={f.prov} title={f.title} /> : null}
      </div>
      <Eyebrow>{label}</Eyebrow>
      {lo && hi ? (
        <div className="stat__ci num">
          {Math.round((level ?? 0.95) * 100)} % CI {lo.text} – {hi.text}
        </div>
      ) : null}
      {footer ? <div className="stat__footer">{footer}</div> : null}
      {f.missing && f.reason ? <div className="stat__footer">missing: {f.reason}</div> : null}
    </div>
  );
};
