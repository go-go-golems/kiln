import { useBoard } from '@/app/board-context';
import { useResolved } from '@/app/useResolved';
import { Meter } from '@/components/atoms/Meter';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { EmptyState } from '@/components/molecules/EmptyState';
import type { Ent } from '@/lang/rows';
import { RunBadges } from '../ManifestView';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './RunListView.css';

export const RunListView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const r = useResolved((res) => ctx.reg.source.runs(String(res(view.args[0]))), [view, ctx.reg]);
  if (r.error) return <PanelError error={r.error} />;
  const runs = (r.value ?? []) as Ent[];
  return (
    <Panel kind="runs" input={String(view.args[0])} footer={`${runs.length} runs · ${runs.filter((x) => !(x.validity as { ok: boolean }).ok).length} invalid`} flush>
      {runs.length === 0 ? (
        <EmptyState title="No runs imported" />
      ) : (
        <ul className="runlist">
          {runs.map((run) => {
            const act = run.activation as Record<string, string>;
            return (
              <li key={run.ref}>
                <button type="button" onClick={() => ctx.fire(view, 'select', { entity: run, row: run })}>
                  <span className="runlist__ref mono">{run.ref}</span>
                  <span className="runlist__act mono">{Object.entries(act).filter(([k]) => k !== 'reason').map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
                  <RunBadges run={run} />
                  <Meter steps={false} value={(run.coverage as { complete: boolean }).complete ? 1 : 0.8} max={1} label="coverage" tone={(run.coverage as { complete: boolean }).complete ? 'ink' : 'warn'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
};
