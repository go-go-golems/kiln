import { useResolved } from '@/app/useResolved';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { EmptyState } from '@/components/molecules/EmptyState';
import { isEnt, type Ent } from '@/lang/rows';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './BatchView.css';

/** Logical order versus physical batch membership, and the inverse permutation that restores it. */
export const BatchView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <PanelError error={r.error} />;
  const raw = r.value;
  const b = (isEnt(raw) ? raw : Array.isArray(raw) ? raw.find(isEnt) : null) as Ent | null;
  if (!b) return <Panel kind="batch"><EmptyState title="Select a request" hint="Click a point in the chart to see its physical batch." /></Panel>;
  const logical = b.logicalOrder as string[];
  const physical = b.physicalMembership as string[];
  const inv = b.inversePermutation as number[];
  const W = 520;
  const step = Math.min(110, (W - 40) / Math.max(1, logical.length));
  return (
    <Panel kind="batch" input={b.ref} footer={`layout key ${String(b.layoutKey)} · equal tensor shapes do not imply graph compatibility`}>
      <svg className="batchview" viewBox={`0 0 ${W} 110`} role="img" aria-label="Logical order mapped to physical batch positions">
        <text x={0} y={14} className="bv-label">LOGICAL</text>
        <text x={0} y={104} className="bv-label">PHYSICAL</text>
        {logical.map((id, i) => {
          const j = physical.indexOf(id);
          const x1 = 80 + i * step;
          const x2 = 80 + j * step;
          return (
            <g key={id}>
              <line x1={x1 + step / 2 - 4} y1={26} x2={x2 + step / 2 - 4} y2={82} className="bv-link" />
              <rect x={x1} y={8} width={step - 8} height={18} className="bv-cell" />
              <text x={x1 + 4} y={21} className="bv-text">{id.split('.').pop()}</text>
              <rect x={80 + i * step} y={84} width={step - 8} height={18} className="bv-cell" />
              <text x={80 + i * step + 4} y={97} className="bv-text">{physical[i].split('.').pop()}</text>
            </g>
          );
        })}
      </svg>
      <div className="mono muted" style={{ fontSize: 11 }}>
        inverse permutation [{inv.join(', ')}]
      </div>
    </Panel>
  );
};
