import { useEffect, useState } from 'react';
import { useResolved } from '@/app/useResolved';
import { Button } from '@/components/atoms/Button';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { RichText } from '@/components/molecules/RichText';
import { TexMath } from '@/components/atoms/TexMath';
import { walkthrough, type AlgoSpec } from '@/lang/algo';
import { SourceRef } from '../SourceView';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './StepperView.css';

/** A deterministic walkthrough. Everything it shows is illustrative and is stamped as such. */
export const StepperView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => {
    const spec = view.args[0] as AlgoSpec;
    const opts = Object.fromEntries(Object.entries(spec.opts).map(([k, v]) => [k, res(v)]));
    const mode = res(view.p('compare')) as string | undefined;
    const impl = view.p('implements') as { ref?: string } | undefined;
    return { w: walkthrough(spec.kind, opts, mode), impl: impl?.ref, caveat: res(view.p('caveat')) as string | undefined, kind: spec.kind };
  }, [view]);
  const [step, setStep] = useState(0);
  const key = JSON.stringify(r.value?.w.groups.map((g) => g.cells.map((c) => c.value)));
  useEffect(() => setStep(0), [key]);
  if (r.error) return <Panel kind="stepper"><PanelError error={r.error} /></Panel>;
  const { w, impl, caveat, kind } = r.value!;
  const s = w.steps[Math.min(step, w.steps.length - 1)];
  const lit = new Set(s?.highlight ?? []);
  return (
    <Panel kind="stepper" input={`algo.${kind}`} stamp="ILLUSTRATIVE" footer="Computed from a small fixture; not recovered GPU state and not a measurement.">
      <div
        className="stepper"
        tabIndex={0}
        role="group"
        aria-label={`${w.title}, step ${step + 1} of ${w.steps.length}; left and right arrows step`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.preventDefault(), setStep((x) => Math.min(w.steps.length - 1, x + 1)));
          if (e.key === 'ArrowLeft') (e.preventDefault(), setStep((x) => Math.max(0, x - 1)));
        }}
      >
        <div className="stepper__head">
          <h4>{w.title}</h4>
          <div className="stepper__formula">
            <TexMath tex={w.formula} display />
          </div>
        </div>
        <div className="stepper__groups">
          {w.groups.map((g) => (
            <div key={g.id} className="stepper__group">
              <Eyebrow>{g.label}</Eyebrow>
              <div className="stepper__grid" style={{ gridTemplateColumns: `repeat(${Math.min(g.cols, 8)}, minmax(54px, 1fr))` }}>
                {g.cells.map((c) => (
                  <div key={c.id} className={`stepper__cell${lit.has(c.id) ? ' is-lit' : ''}`}>
                    <span className="stepper__clabel">
                      <RichText text={c.label} />
                    </span>
                    <span className="stepper__cval num">{c.value}</span>
                    {c.sub ? (
                      <span className="stepper__csub">
                        <RichText text={c.sub} />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="stepper__ctl">
          <Button size="sm" icon="chevronLeft" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0} aria-label="Previous step" />
          <span className="num">
            step {step + 1} / {w.steps.length}
          </span>
          <Button size="sm" icon="chevronRight" onClick={() => setStep((x) => Math.min(w.steps.length - 1, x + 1))} disabled={step >= w.steps.length - 1} aria-label="Next step" />
          <strong>{s?.title}</strong>
          <span className="muted">
            <RichText text={s?.detail ?? ''} />
          </span>
        </div>
        {w.counters ? (
          <dl className="stepper__counters">
            {w.counters.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd className="num">{c.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <ul className="stepper__notes">
          {w.notes.map((n) => (
            <li key={n}>
              <RichText text={n} />
            </li>
          ))}
        </ul>
        {caveat ? (
          <div className="stepper__caveat">
            <RichText text={caveat} />
          </div>
        ) : null}
        {impl ? (
          <div className="stepper__impl">
            <Eyebrow>implements</Eyebrow> <SourceRef refText={impl} evidence="illustrative link" />
          </div>
        ) : null}
      </div>
    </Panel>
  );
};
