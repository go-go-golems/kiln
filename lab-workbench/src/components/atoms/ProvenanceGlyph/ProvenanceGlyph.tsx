import type { Prov } from '@/lang/values';
import { PROV_GLYPH } from '@/lib/format';
import './ProvenanceGlyph.css';

export const ProvenanceGlyph: React.FC<{ prov: Prov; title?: string }> = ({ prov, title }) => (
  <span className={`prov prov--${prov}`} title={title ?? prov.toUpperCase()} aria-label={prov}>
    {PROV_GLYPH[prov]}
  </span>
);
