import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { KeyValueTable } from '@/components/molecules/KeyValueTable/KeyValueTable';
import { selectLabParams } from '@/features/params/paramsSlice';
import { changeParam } from '@/features/params/thunks';
import { select, setTab } from '@/features/selection/selectionSlice';
import type { IR } from '@/lang/ir';
import type { BuildRegistry } from '@/lang/runtime';
import { globToRegExp } from '@/lang/util';
import { useCapabilitiesQuery } from '@/services/labApi';
import { RunBadges } from '../views/ManifestView';
import './RunsTab.css';

const HostCard: React.FC<{ host: string }> = ({ host }) => {
  const { data, error, isLoading } = useCapabilitiesQuery(host);
  if (isLoading) return <p className="muted">loading capability report…</p>;
  if (error || !data) return <p className="muted">no capability report for {host}</p>;
  return (
    <div className="runs__host">
      <Eyebrow tone="accent">capabilities@{host}</Eyebrow>
      <KeyValueTable
        rows={[
          { key: 'gpu', value: data.gpu },
          { key: 'cpu', value: `${data.cpu} · ${data.coreClasses.join(' / ')}` },
          { key: 'arch', value: data.arch },
          { key: 'tools', value: Object.entries(data.tools).map(([k, v]) => `${k} ${v}`).join(' · ') },
          { key: 'unsupported', value: data.unsupportedCounters.join(', ') || 'none recorded' },
        ]}
      />
    </div>
  );
};

/** The run catalog by experiment → arm → mode. Choosing a run feeds the board's run parameter when it has one. */
export const RunsTab: React.FC<{ labId: string; ir: IR; reg: BuildRegistry; boardId: string }> = ({ labId, ir, reg, boardId }) => {
  const dispatch = useAppDispatch();
  const values = useAppSelector((s) => selectLabParams(s, labId).values);
  const board = ir.boards.find((b) => b.id === boardId);
  const runParam = ir.params.find((p) => p.control === 'pickRun' && board?.paramKeys.includes(p.key));
  const hosts = [...new Set(ir.experiments.map((e) => e.host))];
  const runs = reg.source.runs('*/*/*');
  const byExp = new Map<string, typeof runs>();
  for (const r of runs) byExp.set(String(r.experiment), [...(byExp.get(String(r.experiment)) ?? []), r]);
  const choose = (ref: string) => {
    if (runParam && globToRegExp(runParam.constraints.runPattern ?? '').test(ref.split('#')[0])) dispatch(changeParam(labId, runParam.key, ref));
    dispatch(select(ref));
    if (!runParam) dispatch(setTab('inspect'));
  };
  return (
    <div className="runs">
      {hosts.map((h) => (
        <HostCard key={h} host={h} />
      ))}
      {runParam ? <p className="runs__hint muted">Choosing a {runParam.constraints.runPattern} run sets “{runParam.label}”.</p> : null}
      {[...byExp.entries()].map(([exp, list]) => (
        <section key={exp}>
          <Eyebrow as="h3" tone="accent">
            {exp} · {list.length} runs
          </Eyebrow>
          <ul className="runs__list">
            {list.map((r) => (
              <li key={r.ref}>
                <button type="button" className={values[runParam?.key ?? ''] === r.ref ? 'is-on' : ''} onClick={() => choose(r.ref)}>
                  <span className="mono runs__ref">{r.ref.replace(`${exp}/`, '')}</span>
                  <RunBadges run={r} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {runs.length === 0 ? <p className="muted">No runs are imported for this lab.</p> : null}
    </div>
  );
};
