import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRuntimeState } from '@/app/board-context';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { DataBlock } from '@/components/molecules/DataBlock';
import { EmptyState } from '@/components/molecules/EmptyState';
import { RichText } from '@/components/molecules/RichText';
import type { ViewB } from '@/lang/builders';
import type { IR } from '@/lang/ir';
import type { BuildRegistry } from '@/lang/runtime';
import { evaluateHypothesis, type Verdict } from '../views/HypothesisView';
import './LabTab.css';

const TONE: Record<Verdict, 'ok' | 'bad' | 'warn'> = { supported: 'ok', refuted: 'bad', open: 'warn', unqualified: 'warn' };

/** Boards whose views include hypothesisCard(id). */
function boardsShowing(reg: BuildRegistry, ir: IR, id: string) {
  const has = (v: ViewB): boolean =>
    (v.kind === 'hypothesisCard' && v.args[0] === id) || v.children.some(has) || Object.values(v.slots).some(has);
  return ir.boards.filter((b) => reg.boards.get(b.id)?.views.some(has));
}

/**
 * What the program declares, independent of the board in view: its experiments (question, contract, arms,
 * captures and their plan status), its hypotheses (claim, verdict, alternatives, scope) and its boards.
 */
export const LabTab: React.FC<{ labId: string; ir: IR; reg: BuildRegistry }> = ({ labId, ir, reg }) => {
  const state = useRuntimeState(labId);
  const { search } = useLocation();
  const hypotheses = useMemo(
    () =>
      ir.hypotheses.map((h) => {
        try {
          return { id: h.id, ...evaluateHypothesis(reg, state, h.id), error: null };
        } catch (e) {
          return { id: h.id, h: null, checks: [], support: [], verdict: null, error: (e as Error).message };
        }
      }),
    [ir, reg, state],
  );
  const boardLink = (id: string) => `/labs/${encodeURIComponent(labId)}/boards/${encodeURIComponent(id)}${search}`;
  return (
    <div className="labtab">
      <section>
        <Eyebrow as="h3" tone="accent">
          Boards · {ir.boards.length}
        </Eyebrow>
        <ol className="labtab__boards">
          {ir.boards.map((b) => (
            <li key={b.id}>
              <Link to={boardLink(b.id)} className="labtab__board">
                <span className="mono labtab__num">B-{String(b.index + 1).padStart(2, '0')}</span>
                <span>
                  <RichText text={b.title} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <Eyebrow as="h3" tone="accent">
          Experiments · {ir.experiments.length}
        </Eyebrow>
        {ir.experiments.length ? null : <EmptyState title="No experiments declared" hint="Add one with lab(…).experiment(id, e => e.question(…)…)." />}
        {ir.experiments.map((e) => {
          const resolved = reg.experiments.get(e.id);
          const caps = ir.plan.captures.filter((c) => c.experiment === e.id);
          return (
            <article key={e.id} className="labtab__card">
              <header className="labtab__cardHead">
                <span className="mono labtab__id">{e.id}</span>
                <span className="labtab__chips">
                  <Chip variant="outline">{e.host}</Chip>
                  <Chip variant="outline">{e.workload}</Chip>
                  {e.forkOf ? <Chip variant="outline">fork of {e.forkOf}</Chip> : null}
                </span>
              </header>
              <p className={`labtab__question${e.question ? '' : ' is-missing'}`}>{e.question ? <RichText text={e.question} /> : 'No question declared (.question(text)).'}</p>
              {e.purpose ? <p className="labtab__muted">purpose: {e.purpose}</p> : null}
              <dl className="labtab__facts">
                <dt>boundary</dt>
                <dd className="mono">{e.boundary ?? '—'}</dd>
                <dt>arms</dt>
                <dd>
                  {(resolved?.arms ?? e.arms).map((a) => (
                    <span key={a.name} className="labtab__arm mono">
                      {a.role} {a.name}
                      {a.rev ? ` @ ${String(a.rev).slice(0, 12)}` : ''}
                      {'switches' in a && a.switches ? ` · ${Object.entries(a.switches as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`).join(' ')}` : ''}
                      {a.skipped ? ` · skipped: ${a.skipped}` : ''}
                    </span>
                  ))}
                </dd>
                <dt>captures</dt>
                <dd className="labtab__caps">
                  {caps.map((c) => (
                    <span key={c.id} className="mono labtab__cap">
                      <Chip tone={c.status === 'cached' ? 'ok' : c.status === 'blocked' ? 'warn' : 'sig'} variant="tint">
                        {c.status}
                      </Chip>
                      {c.arm}/{c.mode} ×{c.reps}
                    </span>
                  ))}
                </dd>
              </dl>
              {e.limitations.length ? (
                <ul className="labtab__limits">
                  {e.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : null}
              {resolved ? (
                <details className="labtab__contract">
                  <summary>Contract (resolved at plan time)</summary>
                  <DataBlock
                    value={{ state: resolved.state, warmup: resolved.warmup, expect: resolved.expect, gate: resolved.gate, repeat: resolved.repeat, compare: resolved.compare, workload: resolved.workload }}
                    label={`${e.id} · contract`}
                    maxHeight={300}
                  />
                </details>
              ) : null}
            </article>
          );
        })}
      </section>

      <section>
        <Eyebrow as="h3" tone="accent">
          Hypotheses · {hypotheses.length}
        </Eyebrow>
        {hypotheses.length ? null : <EmptyState title="No hypotheses declared" hint="Add one with lab(…).hypothesis(id, h => h.claim(…).predicts(…))." />}
        {hypotheses.map((x) => {
          const shown = boardsShowing(reg, ir, x.id);
          const failed = x.checks.filter((c) => !c.pass).length;
          return (
            <article key={x.id} className="labtab__card">
              <header className="labtab__cardHead">
                <span className="mono labtab__id">{x.id}</span>
                {x.verdict ? (
                  <Chip tone={TONE[x.verdict]} variant="tint">
                    {x.verdict}
                  </Chip>
                ) : (
                  <Chip tone="bad" variant="tint">
                    error
                  </Chip>
                )}
              </header>
              {x.error ? <p className="labtab__error">{x.error}</p> : null}
              {x.h ? (
                <>
                  <p className="labtab__question">
                    <RichText text={x.h.claimText} />
                  </p>
                  <p className="labtab__muted mono">
                    prediction: {x.checks.length ? `${x.checks.length - failed} of ${x.checks.length} rows hold` : 'no predicted rows yet'} · evidence:{' '}
                    {x.support.map((s) => `${s.describe} (${s.count})`).join(', ') || '—'}
                  </p>
                  {x.h.alternativesList.length ? (
                    <>
                      <Eyebrow>Alternatives not ruled out</Eyebrow>
                      <ul className="labtab__limits">
                        {x.h.alternativesList.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {x.h.scopeText ? <p className="labtab__muted">scope: {x.h.scopeText}</p> : null}
                </>
              ) : null}
              <p className="labtab__muted">
                {shown.length ? (
                  <>
                    shown on{' '}
                    {shown.map((b, i) => (
                      <span key={b.id}>
                        {i ? ', ' : ''}
                        <Link to={boardLink(b.id)}>B-{String(b.index + 1).padStart(2, '0')}</Link>
                      </span>
                    ))}
                  </>
                ) : (
                  'not shown on any board (add hypothesisCard(id) to one)'
                )}
              </p>
            </article>
          );
        })}
      </section>

      <section>
        <Eyebrow as="h3" tone="accent">
          Derives · {[...reg.derives.keys()].length}
        </Eyebrow>
        <ul className="labtab__derives mono">
          {[...reg.derives.keys()].map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};
