import { useBoard } from '@/app/board-context';
import { useResolved } from '@/app/useResolved';
import { Chip } from '@/components/atoms/Chip';
import { EmptyState } from '@/components/molecules/EmptyState';
import { MetricsTable } from '@/components/molecules/MetricsTable';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { isEnt, type Ent } from '@/lang/rows';
import { fmtNumber } from '@/lang/util';
import { SourceRef } from '../SourceView';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './KernelCardView.css';

/**
 * A kernel and its counters. A traced kernel carries no counters; when a counter capture of the same
 * experiment and arm profiled a kernel of the same name, its metrics are shown as a structural match.
 */
export const KernelCardView: React.FC<ViewProps> = ({ view }) => {
  const { reg } = useBoard();
  const r = useResolved((res) => {
    const v = res(view.args[0]);
    const names = view.args[1] ? (res(view.args[1]) as string[]) : undefined;
    return { k: isEnt(v) ? v : Array.isArray(v) ? ((v.find(isEnt) as Ent | undefined) ?? null) : null, names };
  }, [view]);
  if (r.error) return <PanelError error={r.error} />;
  const k = r.value?.k ?? null;
  if (!k || k.kind !== 'kernel') {
    return (
      <Panel kind="kernel">
        <EmptyState title="No kernel selected" hint="Select a kernel on a timeline or in a mirror." />
      </Panel>
    );
  }
  let counters: Ent = k;
  let matchNote: string | null = null;
  if (!k.metrics) {
    const [exp, arm] = String(k.run).split('/');
    const twin = reg.source.entities('kernel', `${exp}/${arm}/kernels#*`).find((x) => x.name === k.name && x.metrics && Object.keys(x.metrics as object).length);
    if (twin) {
      counters = twin;
      matchNote = `counters from ${twin.run} — a different run, matched by kernel name (structural, not the same launch)`;
    }
  }
  const code = k.code ? reg.source.entity(`${k.run}!code:${String(k.code)}`) : undefined;
  return (
    <Panel
      kind="kernel"
      input={String(k.run)}
      footer={matchNote ?? (counters.metrics ? `counters from ${String(counters.run)}` : 'no counter capture covers this kernel; values below are missing, not zero')}
    >
      <div className="kcard">
        <div className="kcard__name mono">{String(k.name)}</div>
        <div className="kcard__meta">
          <Chip>{String(k.role ?? 'kernel')}</Chip>
          {k.op ? <Chip>{String(k.op)}</Chip> : null}
          {k.selected ? <Chip tone="sig" variant="tint">profiled launch</Chip> : null}
          <span className="num muted">
            {fmtNumber(Number(k.dur), 3)} ms · grid {String(k.grid ?? '—')} · block {String(k.block ?? '—')}
          </span>
        </div>
        <div className="kcard__src">
          {code?.source ? <SourceRef refText={String(code.source)} evidence="compiled_from · direct" /> : <span className="kcard__nosrc">source unavailable — {String(code?.sourceReason ?? 'no code object')}</span>}
        </div>
        <MetricsTable entity={counters} names={r.value?.names} />
      </div>
    </Panel>
  );
};
