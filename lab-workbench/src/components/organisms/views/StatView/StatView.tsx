import { useResolved } from '@/app/useResolved';
import { StatTile } from '@/components/molecules/StatTile';
import { PanelError } from '@/components/molecules/Panel/Panel';
import type { PairedRatioResult } from '@/lang/stats';
import { missing } from '@/lang/values';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';

const isEstimate = (x: unknown): x is PairedRatioResult => typeof x === 'object' && x !== null && (x as PairedRatioResult).__estimate === true;

export const StatView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => ({ value: res(view.args[0]), label: res(view.args[1]) }), [view]);
  if (r.error) return <PanelError error={r.error} />;
  const label = String(r.value?.label ?? '');
  const v = r.value?.value;
  if (isEstimate(v)) {
    return <StatTile value={v.median} label={label} interval={v.ci} level={v.level} footer={`paired · unit=${v.unit} · ${v.note}`} />;
  }
  return <StatTile value={v === undefined ? missing('no value for this selection') : v} label={label} />;
};
