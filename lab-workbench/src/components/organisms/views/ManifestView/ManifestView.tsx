import { useResolved } from '@/app/useResolved';
import { KeyValueTable, type KVRow } from '@/components/molecules/KeyValueTable/KeyValueTable';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Chip } from '@/components/atoms/Chip';
import { useBoard } from '@/app/board-context';
import type { Ent } from '@/lang/rows';
import { isEnt } from '@/lang/rows';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './ManifestView.css';

type Rec = Record<string, unknown>;

export function runFor(reg: ReturnType<typeof useBoard>['reg'], x: unknown): Ent | null {
  if (isEnt(x)) return x.kind === 'run' ? x : (reg.source.entity(String(x.run)) ?? null);
  if (typeof x !== 'string') return null;
  const ref = x.includes('#') ? x : `${x}#0`;
  return reg.source.entity(ref) ?? null;
}

export const RunBadges: React.FC<{ run: Ent }> = ({ run }) => {
  const v = run.validity as { ok: boolean; reasons: string[] };
  const q = run.quality as { status: string };
  const cov = run.coverage as { complete: boolean };
  return (
    <span className="runbadges">
      <Chip tone={v.ok ? 'ok' : 'bad'} variant="tint" title={v.reasons.join('; ') || 'valid'}>
        {v.ok ? 'valid' : 'invalid'}
      </Chip>
      <Chip tone={q.status === 'qualified' ? 'ok' : 'warn'} variant="tint">
        {q.status}
      </Chip>
      <Chip tone={cov.complete ? 'neutral' : 'warn'} variant={cov.complete ? 'outline' : 'tint'}>
        {cov.complete ? 'coverage complete' : 'coverage gaps'}
      </Chip>
      {run.synthetic === false ? <Chip variant="outline" title="imported from a real run on this machine">measured</Chip> : <Chip>synthetic</Chip>}
    </span>
  );
};

export function manifestRows(run: Ent): KVRow[] {
  const m = run.manifest as Rec;
  const v = run.validity as { ok: boolean; reasons: string[] };
  const cov = run.coverage as { trace: { lost: Rec[] }; source: { missing: Rec[] }; links: { missing: Rec[] } };
  const act = run.activation as Rec;
  return [
    { key: 'run', value: run.ref },
    { key: 'host', value: m.host },
    { key: 'revision', value: m.revision },
    { key: 'workload', value: m.workload },
    { key: 'boundary', value: m.boundary },
    { key: 'fixtures', value: m.fixtures },
    { key: 'precision', value: m.precision },
    ...(m.impl ? [{ key: 'implementation', value: m.impl }, { key: 'device', value: m.device }, { key: 'threads', value: m.threads }] : []),
    { key: 'state', value: m.state ? Object.entries(m.state as Rec).map(([k, x]) => `${k}=${String(x)}`).join(' · ') : null },
    { key: 'activation', value: Object.entries(act).map(([k, x]) => `${k} ${String(x)}`).join(' · ') || null },
    { key: 'validity', value: v.ok ? 'valid' : v.reasons.join('; '), tone: v.ok ? undefined : 'bad' },
    { key: 'quality gate', value: m.gate ?? 'none declared', tone: m.gate ? undefined : 'warn' },
    { key: 'toolchain', value: m.toolchain },
    { key: 'clock', value: run.clock },
    { key: 'trace lost', value: cov.trace.lost.length ? cov.trace.lost.map((g) => `${g.from}–${g.to} s (${g.reason})`).join('; ') : 'none', tone: cov.trace.lost.length ? 'warn' : undefined },
    { key: 'source missing', value: cov.source.missing.length ? cov.source.missing.map((s) => s.code).join(', ') : 'none' },
    { key: 'links missing', value: cov.links.missing.length ? cov.links.missing.map((l) => `${l.count} × ${l.rel}: ${l.reason}`).join('; ') : 'none', tone: cov.links.missing.length ? 'warn' : undefined },
    { key: 'spec hash', value: m.specHash },
    { key: 'started', value: run.startedAt },
  ];
}

export const ManifestView: React.FC<ViewProps> = ({ view }) => {
  const { reg } = useBoard();
  const r = useResolved((res) => runFor(reg, res(view.args[0])), [view, reg]);
  if (r.error) return <PanelError error={r.error} />;
  const run = r.value;
  return (
    <Panel kind="manifest" input={run?.ref}>
      {run ? (
        <>
          <RunBadges run={run} />
          <KeyValueTable rows={manifestRows(run)} caption={`Manifest of ${run.ref}`} />
        </>
      ) : (
        <EmptyState title="Run not imported" hint="This run is not in the artifact store. Check PLAN for captures to execute." />
      )}
    </Panel>
  );
};

const INVALIDATING = ['workload', 'boundary', 'fixtures', 'precision', 'host', 'inputSize', 'gate', 'state', 'device', 'threads'];
const TREATMENT = ['revision', 'impl'];

export const ManifestDiffView: React.FC<ViewProps> = ({ view }) => {
  const { reg } = useBoard();
  const r = useResolved((res) => [runFor(reg, res(view.args[0])), runFor(reg, res(view.args[1]))] as const, [view, reg]);
  if (r.error) return <PanelError error={r.error} />;
  const [a, b] = r.value ?? [null, null];
  if (!a || !b) return <Panel kind="manifest diff"><EmptyState title="Both runs must be imported" /></Panel>;
  const ma = a.manifest as Rec;
  const mb = b.manifest as Rec;
  const fields = ['host', 'workload', 'boundary', 'fixtures', 'precision', 'inputSize', 'state', 'gate', 'toolchain', 'revision', ...(ma.impl || mb.impl ? ['impl', 'device', 'threads'] : []), 'arm', 'mode'];
  const excludes = fields.filter((f) => INVALIDATING.includes(f) && JSON.stringify(ma[f]) !== JSON.stringify(mb[f]));
  // the treatment is whatever distinguishes the arms on purpose: a revision, or an implementation switch
  const treatment = TREATMENT.filter((f) => fields.includes(f) && JSON.stringify(ma[f]) !== JSON.stringify(mb[f]));
  const fmt = (v: unknown) => (v && typeof v === 'object' ? Object.entries(v as Rec).map(([k, x]) => `${k}=${String(x)}`).join(' · ') : v === null || v === undefined ? '—' : String(v));
  return (
    <Panel
      kind="manifest diff"
      input={`${a.ref} ↔ ${b.ref}`}
      footer={
        excludes.length
          ? `Comparison excluded: ${excludes.join(', ')} differ.`
          : `Identity matches on every field that would invalidate the comparison; ${treatment.length ? `the treatment is the ${treatment.map((f) => (f === 'impl' ? 'implementation' : f)).join(' and the ')}` : 'no treatment field differs'}.`
      }
    >
      <div className="mdiff">
        <table>
          <thead>
            <tr>
              <th scope="col">field</th>
              <th scope="col">{a.ref}</th>
              <th scope="col">{b.ref}</th>
              <th scope="col" className="sr-only">verdict</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const same = JSON.stringify(ma[f]) === JSON.stringify(mb[f]);
              const bad = !same && INVALIDATING.includes(f);
              return (
                <tr key={f} className={bad ? 'is-bad' : !same ? 'is-diff' : ''}>
                  <th scope="row">{f}</th>
                  <td>{fmt(ma[f])}</td>
                  <td>{fmt(mb[f])}</td>
                  <td>{bad ? <Chip tone="bad" variant="tint">excludes</Chip> : !same ? <Chip>{TREATMENT.includes(f) ? 'treatment' : 'differs'}</Chip> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mdiff__badges">
        <RunBadges run={a} />
        <RunBadges run={b} />
      </div>
    </Panel>
  );
};
