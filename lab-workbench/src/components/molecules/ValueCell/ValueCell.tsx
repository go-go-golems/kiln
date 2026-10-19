import { ProvenanceGlyph } from '@/components/atoms/ProvenanceGlyph';
import { formatValue } from '@/lib/format';
import './ValueCell.css';

/** A table cell for any value: provenance glyph, unit, and a hatched "—" with its reason when missing. */
export const ValueCell: React.FC<{ value: unknown; unit?: string; showGlyph?: boolean; align?: 'left' | 'right' }> = ({
  value,
  unit,
  showGlyph = true,
  align = 'right',
}) => {
  const f = formatValue(value, unit);
  return (
    <span className={`vcell vcell--${align}${f.missing ? ' is-missing' : ''} vcell--${f.prov}`} title={f.title}>
      {showGlyph && (f.prov !== 'observed' || f.missing) ? <ProvenanceGlyph prov={f.prov} title={f.title} /> : null}
      <span className="vcell__text">{f.text}</span>
      {f.missing && f.reason ? <span className="sr-only">missing: {f.reason}</span> : null}
    </span>
  );
};
