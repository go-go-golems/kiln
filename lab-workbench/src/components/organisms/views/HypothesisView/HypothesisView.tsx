import { useMemo } from 'react';
import { useBoard } from '@/app/board-context';
import { useAppSelector } from '@/app/hooks';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { ValueCell } from '@/components/molecules/ValueCell';
import { RichText } from '@/components/molecules/RichText';
import { selectAnnotations } from '@/features/annotations/annotationsSlice';
import { isQuery } from '@/lang/query';
import { FIELD_UNITS, isEnt } from '@/lang/rows';
import { materialize } from '@/lang/runtime';
import { isValue } from '@/lang/values';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './HypothesisView.css';

export type Verdict = 'supported' | 'refuted' | 'open' | 'unqualified';

export function evaluateHypothesis(reg: ReturnType<typeof useBoard>['reg'], state: ReturnType<typeof useBoard>['state'], id: string) {
  const h = reg.hypotheses.get(id);
  if (!h) throw new Error(`unknown hypothesis "${id}"`);
  const rows = h.prediction ? ((materialize(reg, h.prediction.query, state) as Record<string, unknown>[]) ?? []) : [];
  const checks = rows.map((row) => {
    const missing = Object.entries(row).filter(([, v]) => isValue(v) && v.value === null).map(([k]) => k);
    let pass = false;
    try {
      // a predicate that returns a value is judged by it: a missing value supports nothing
      const out = h.prediction!.fn(row);
      pass = isValue(out) ? out.value !== null && Boolean(out.value) : Boolean(out);
    } catch {
      pass = false;
    }
    return { row, pass, missing };
  });
  const support = h.support.map((s) => {
    const v = isQuery(s) ? (materialize(reg, s, state) as unknown[]) : [];
    const runs = new Set((Array.isArray(v) ? v : []).filter(isEnt).map((e) => String(e.run)));
    const invalid = [...runs].filter((ref) => !(reg.source.entity(ref)?.validity as { ok?: boolean } | undefined)?.ok);
    return { describe: isQuery(s) ? s.describe() : String(s), count: Array.isArray(v) ? v.length : 0, invalid };
  });
  let verdict: Verdict;
  if (support.some((s) => s.invalid.length)) verdict = 'unqualified';
  else if (!checks.length) verdict = 'open';
  else if (checks.every((c) => c.pass)) verdict = 'supported';
  else if (checks.some((c) => !c.pass && c.missing.length)) verdict = 'open';
  else verdict = 'refuted';
  return { h, checks, support, verdict };
}

const TONE: Record<Verdict, 'ok' | 'bad' | 'warn'> = { supported: 'ok', refuted: 'bad', open: 'warn', unqualified: 'warn' };

export const HypothesisView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const id = String(view.args[0]);
  const notes = useAppSelector((s) => selectAnnotations(s, ctx.labId))[id]?.alternatives ?? [];
  const res = useMemo(() => {
    try {
      return { v: evaluateHypothesis(ctx.reg, ctx.state, id) };
    } catch (error) {
      return { error };
    }
  }, [ctx.reg, ctx.state, id]);
  if (res.error || !res.v) return <Panel kind="hypothesis"><PanelError error={res.error} /></Panel>;
  const { h, checks, support, verdict } = res.v;
  return (
    <Panel kind="hypothesis" input={id} stamp={verdict.toUpperCase()} footer={h.scopeText ? `scope: ${h.scopeText}` : undefined}>
      <div className="hyp">
        <p className="hyp__claim">
          <RichText text={h.claimText} />
        </p>
        <div className="hyp__verdict">
          <Chip tone={TONE[verdict]} variant="tint">
            {verdict}
          </Chip>
          <span className="muted">
            {verdict === 'supported'
              ? 'every predicted row satisfies the prediction'
              : verdict === 'refuted'
                ? 'a predicted row contradicts the prediction'
                : verdict === 'open'
                  ? 'evidence is missing for at least one predicted row'
                  : 'a supporting run is invalid'}
          </span>
        </div>
        <Eyebrow>Prediction</Eyebrow>
        <ul className="hyp__checks">
          {checks.map((c, i) => (
            <li key={i}>
              <Chip tone={c.pass ? 'ok' : c.missing.length ? 'warn' : 'bad'}>{c.pass ? 'holds' : c.missing.length ? 'unknown' : 'fails'}</Chip>
              {Object.entries(c.row)
                .slice(0, 6)
                .map(([k, v]) => (
                  <span key={k} className="hyp__kv">
                    <span className="muted">{k}</span> <ValueCell value={v} unit={FIELD_UNITS[k]} align="left" />
                  </span>
                ))}
            </li>
          ))}
        </ul>
        <Eyebrow>Supporting evidence</Eyebrow>
        <ul className="hyp__support mono">
          {support.map((s, i) => (
            <li key={i}>
              {s.describe} — {s.count} rows{s.invalid.length ? ` · invalid runs: ${s.invalid.join(', ')}` : ''}
            </li>
          ))}
        </ul>
        <Eyebrow>Alternatives not ruled out</Eyebrow>
        <ul className="hyp__alts">
          {h.alternativesList.map((a) => (
            <li key={a}>
              <RichText text={a} />
            </li>
          ))}
          {notes.map((n, i) => (
            <li key={`n${i}`}>
              <RichText text={n.text} />
              <span className="hyp__by">
                {' '}
                ◌ added by {n.by}
                {n.test ? ` · test: ${n.test}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
};
