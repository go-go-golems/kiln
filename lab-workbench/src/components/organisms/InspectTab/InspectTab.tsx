import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { IconButton } from '@/components/atoms/IconButton';
import { EmptyState } from '@/components/molecules/EmptyState';
import { EntityChip } from '@/components/molecules/EntityChip';
import { KeyValueTable } from '@/components/molecules/KeyValueTable/KeyValueTable';
import { MetricsTable } from '@/components/molecules/MetricsTable';
import { select } from '@/features/selection/selectionSlice';
import { log } from '@/features/ui/uiSlice';
import type { Link } from '@/lang/rows';
import type { BuildRegistry } from '@/lang/runtime';
import { isValue } from '@/lang/values';
import { manifestRows, RunBadges } from '../views/ManifestView';
import { SourceRef } from '../views/SourceView';
import './InspectTab.css';

const SKIP = new Set(['kind', 'id', 'ref', 'run', 'metrics', 'manifest', 'validity', 'activation', 'coverage', 'quality', 'logicalOrder', 'physicalMembership', 'inversePermutation']);

/** The current selection with its fields, counters and every recorded relationship, by evidence class. */
export const InspectTab: React.FC<{ reg: BuildRegistry }> = ({ reg }) => {
  const dispatch = useAppDispatch();
  const sel = useAppSelector((s) => s.selection.sel);
  const e = sel ? reg.source.entity(sel) : undefined;
  if (!sel) return <div className="insp"><EmptyState title="Nothing selected" hint="Select a row, a timeline event or a run; it appears here with its evidence." /></div>;
  if (!e) return <div className="insp"><EmptyState title="Not in this build" hint={`${sel} is not part of any imported run of the current build.`} /></div>;
  const fields = Object.entries(e).filter(([k, v]) => !SKIP.has(k) && (v === null || typeof v !== 'object' || isValue(v) || Array.isArray(v)));
  const out = reg.source.links(e.ref, null, 'fwd');
  const inn = reg.source.links(e.ref, null, 'back');
  const group = (list: Link[], dir: 'fwd' | 'back') => {
    const m = new Map<string, Link[]>();
    for (const l of list) m.set(l.rel, [...(m.get(l.rel) ?? []), l]);
    return [...m.entries()].map(([rel, ls]) => (
      <div key={`${dir}${rel}`} className="insp__rel">
        <div className="insp__relhead mono">
          {dir === 'fwd' ? '→' : '←'} {rel} <span className="muted">· {ls[0].evidence} · {ls[0].method ?? ''}</span>
        </div>
        <div className="insp__chips">
          {ls.slice(0, 24).map((l) => {
            const ref = dir === 'fwd' ? l.to : l.from;
            const t = reg.source.entity(ref);
            return <EntityChip key={ref} refId={ref} label={String(t?.name ?? t?.id ?? ref.split('!').pop())} evidence={l.evidence} />;
          })}
          {ls.length > 24 ? <span className="muted mono">+{ls.length - 24} more</span> : null}
        </div>
      </div>
    ));
  };
  return (
    <div className="insp">
      <div className="insp__head">
        <Chip variant="solid">{e.kind}</Chip>
        <span className="insp__name">{String(e.name ?? e.id)}</span>
        <IconButton
          size="sm"
          icon="copy"
          label="Copy reference"
          onClick={() => {
            void navigator.clipboard?.writeText(e.ref);
            dispatch(log('info', `copied ${e.ref}`));
          }}
        />
        <IconButton size="sm" icon="close" label="Clear selection" onClick={() => dispatch(select(null))} />
      </div>
      <div className="insp__ref mono">{e.ref}</div>
      {e.kind === 'run' ? (
        <>
          <RunBadges run={e} />
          <KeyValueTable rows={manifestRows(e)} />
        </>
      ) : (
        <>
          {e.run ? (
            <div className="insp__run">
              <Eyebrow>run</Eyebrow> <EntityChip refId={String(e.run)} />
            </div>
          ) : null}
          <KeyValueTable rows={fields.map(([k, v]) => ({ key: k, value: Array.isArray(v) ? `[${v.join(', ')}]` : v }))} />
        </>
      )}
      {e.kind === 'code' ? (
        <div className="insp__src">
          <Eyebrow>source</Eyebrow> {e.source ? <SourceRef refText={String(e.source)} /> : <span className="muted">{String(e.sourceReason ?? 'unavailable')}</span>}
        </div>
      ) : null}
      {e.metrics ? (
        <div>
          <Eyebrow tone="accent">Counters</Eyebrow>
          <MetricsTable entity={e} />
        </div>
      ) : null}
      {out.length || inn.length ? (
        <div>
          <Eyebrow tone="accent">Relationships</Eyebrow>
          {group(out, 'fwd')}
          {group(inn, 'back')}
        </div>
      ) : (
        <p className="muted insp__none">No recorded relationships. Temporal overlap alone never creates one.</p>
      )}
    </div>
  );
};
