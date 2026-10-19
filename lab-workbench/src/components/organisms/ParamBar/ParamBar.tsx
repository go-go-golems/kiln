import { minutesUnit } from '@/lib/format';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/atoms/Button';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ParamControl } from '@/components/molecules/ParamControl';
import { PresetMenu } from '@/components/molecules/PresetMenu';
import { applyValues, resetValue, selectLabParams } from '@/features/params/paramsSlice';
import { changeParam, revertPlan, runPendingPlan } from '@/features/params/thunks';
import { setTab } from '@/features/selection/selectionSlice';
import type { BoardSummary, ParamSummary } from '@/lang/ir';
import type { BuildRegistry, RuntimeState } from '@/lang/runtime';
import { isVisible, resolveOptions, runChoices } from '@/lib/params';
import './ParamBar.css';

const fmt = (v: unknown) => (Array.isArray(v) ? v.join('..') : JSON.stringify(v));

/** Every declared parameter that reaches this board, grouped PLAN first, with the pending-plan banner. */
export const ParamBar: React.FC<{ labId: string; board: BoardSummary; params: ParamSummary[]; reg: BuildRegistry; state: RuntimeState }> = ({ labId, board, params, reg, state }) => {
  const dispatch = useAppDispatch();
  const lp = useAppSelector((s) => selectLabParams(s, labId));
  const [confirm, setConfirm] = useState<{ p: ParamSummary; value: unknown } | null>(null);
  const shown = board.paramKeys.map((k) => params.find((p) => p.key === k)).filter((p): p is ParamSummary => Boolean(p) && isVisible(reg, state, p!.key));
  const groups = new Map<string, ParamSummary[]>();
  for (const p of [...shown].sort((a, b) => (a.binding === 'plan' ? 0 : 1) - (b.binding === 'plan' ? 0 : 1) || a.order - b.order)) {
    const g = p.group ?? (p.binding === 'plan' ? 'Plan · what was measured' : 'Board');
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const value = (p: ParamSummary) => (p.key in lp.values ? lp.values[p.key] : p.defaultValue);
  const anyDiff = shown.some((p) => p.key in lp.values && JSON.stringify(lp.values[p.key]) !== JSON.stringify(p.defaultValue));
  const set = (p: ParamSummary, v: unknown) => {
    if (p.binding === 'plan' && p.confirm) setConfirm({ p, value: v });
    else dispatch(changeParam(labId, p.key, v));
  };
  const applyPreset = (name: string) => {
    const preset = board.presets.find((x) => x.name === name);
    if (!preset) return;
    for (const [n, v] of Object.entries(preset.values)) {
      const p = shown.find((x) => x.name === n || x.urlKey === n);
      if (p) dispatch(changeParam(labId, p.key, v));
    }
  };
  if (!shown.length) return null;
  return (
    <section className="pbar" aria-label="Parameters">
      <div className="pbar__head">
        <Eyebrow tone="accent">Parameters</Eyebrow>
        <span className="pbar__legend muted">VIEW re-renders · DATA recomputes · PLAN needs runs</span>
        <PresetMenu presets={board.presets} onApply={applyPreset} />
        {anyDiff ? (
          <Button
            size="sm"
            variant="ghost"
            icon="reset"
            onClick={() => {
              for (const p of shown) {
                if (p.binding === 'plan') dispatch(changeParam(labId, p.key, p.defaultValue));
                else dispatch(resetValue({ labId, key: p.key }));
              }
              dispatch(applyValues({ labId, values: {} }));
            }}
          >
            Reset all
          </Button>
        ) : null}
      </div>
      {lp.pending ? (
        <div className="pbar__pending" role="status">
          <strong>Pending plan</strong>
          <span>
            {lp.pending.changes.map((c) => `${c.urlKey} ${fmt(c.from)} → ${fmt(c.to)}`).join(' · ')} — {lp.pending.captures.length} captures would execute on {lp.pending.hosts.join(', ')} (≈ {lp.pending.estimateGpuMin} {minutesUnit(lp.pending.hosts)}). The evidence below still reflects the applied values.
          </span>
          <span className="pbar__pendingActions">
            <Button size="sm" onClick={() => dispatch(setTab('plan'))}>
              Review plan
            </Button>
            <Button size="sm" variant="primary" icon="play" onClick={() => dispatch(runPendingPlan(labId))}>
              Run plan
            </Button>
            <Button size="sm" variant="ghost" icon="reset" onClick={() => dispatch(revertPlan(labId))}>
              Revert
            </Button>
          </span>
        </div>
      ) : null}
      {[...groups.entries()].map(([g, list]) => (
        <div key={g} className="pbar__group">
          <Eyebrow>{g}</Eyebrow>
          <div className="pbar__controls">
            {list.map((p) => (
              <ParamControl
                key={p.key}
                p={p}
                value={value(p)}
                options={resolveOptions(reg, state, p)}
                runs={p.control === 'pickRun' ? runChoices(reg, p) : undefined}
                pending={Boolean(lp.pending?.changes.some((c) => c.key === p.key))}
                onChange={(v) => set(p, v)}
                onReset={() => (p.binding === 'plan' ? dispatch(changeParam(labId, p.key, p.defaultValue)) : dispatch(resetValue({ labId, key: p.key })))}
              />
            ))}
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={`Change ${confirm?.p.label ?? ''}?`}
        body={
          <>
            <p>{confirm?.p.confirm}</p>
            <p className="mono">
              {confirm?.p.urlKey}: {fmt(value(confirm?.p ?? params[0]))} → {fmt(confirm?.value)}
            </p>
            <p>Nothing runs until you execute the resulting plan.</p>
          </>
        }
        confirmLabel="Change"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) dispatch(changeParam(labId, confirm.p.key, confirm.value));
          setConfirm(null);
        }}
      />
    </section>
  );
};
