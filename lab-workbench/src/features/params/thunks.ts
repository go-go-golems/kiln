import type { AppThunk } from '@/app/store';
import { getPatches, getRegistry, registerBuild } from '@/app/registry';
import { appEnv } from '@/data/env';
import { build, BuildError } from '@/lang/build';
import { checkParam } from '@/lang/params';
import { buildSucceeded } from '@/features/build/buildSlice';
import { selectSource } from '@/features/program/programSlice';
import { proposeJob } from '@/features/jobs/thunks';
import { loadMeasured } from '@/features/server/thunks';
import { log } from '@/features/ui/uiSlice';
import { applyValues, revertPending, setPending, setValue, type PendingPlan } from './paramsSlice';

export type ParamChangeResult =
  | { ok: false; error: string }
  | { ok: true; applied: true }
  | { ok: true; applied: false; pending: PendingPlan };

/**
 * Change a parameter. View- and data-bound values apply immediately. A plan-bound value rebuilds a
 * candidate IR: if its captures are already imported it applies, otherwise it becomes a pending plan.
 */
export const changeParam =
  (labId: string, key: string, value: unknown): AppThunk<ParamChangeResult> =>
  (dispatch, getState) => {
    const lb = getState().build.byLab[labId];
    const reg = getRegistry(lb?.buildId ?? undefined);
    const p = reg?.params.get(key);
    if (!reg || !p) return { ok: false, error: `unknown parameter ${key}` };
    const check = checkParam(p.slot.spec, value, p.summary.options);
    if (!check.ok) {
      dispatch(log('warn', `parameter ${p.slot.urlKey}: ${check.error}`));
      return { ok: false, error: check.error };
    }
    dispatch(setValue({ labId, key, value }));
    if (p.summary.binding !== 'plan') {
      dispatch(applyValues({ labId, values: { [key]: value } }));
      return { ok: true, applied: true };
    }
    return dispatch(evaluatePending(labId));
  };

export const evaluatePending =
  (labId: string): AppThunk<ParamChangeResult> =>
  (dispatch, getState) => {
    const state = getState();
    const lp = state.params.byLab[labId];
    const ir = state.build.byLab[labId]?.ir;
    if (!lp || !ir) return { ok: true, applied: true };
    const planParams = ir.params.filter((p) => p.binding === 'plan');
    const changes = planParams
      .filter((p) => p.key in lp.values && JSON.stringify(lp.values[p.key]) !== JSON.stringify(p.key in lp.applied ? lp.applied[p.key] : p.defaultValue))
      .map((p) => ({ key: p.key, urlKey: p.urlKey, from: p.key in lp.applied ? lp.applied[p.key] : p.defaultValue, to: lp.values[p.key] }));
    if (!changes.length) {
      dispatch(setPending({ labId, pending: null }));
      return { ok: true, applied: true };
    }
    const desired = { ...lp.applied, ...Object.fromEntries(changes.map((c) => [c.key, c.to])) };
    try {
      const out = build({ source: selectSource(state, labId), labId, params: desired, env: appEnv(state.catalog.available), patches: getPatches(labId) });
      registerBuild(out.registry);
      const toRun = out.ir.plan.captures.filter((c) => c.status !== 'cached');
      if (toRun.length === 0) {
        dispatch(buildSucceeded({ labId, buildId: out.registry.buildId, ir: out.ir }));
        dispatch(applyValues({ labId, values: desired }));
        dispatch(setPending({ labId, pending: null }));
        // the captures are stored, but measured ones may not have been fetched into this browser yet
        if (getState().server.status === 'online') void dispatch(loadMeasured(labId));
        dispatch(log('ok', `applied ${changes.map((c) => `${c.urlKey}=${JSON.stringify(c.to)}`).join(', ')} — evidence already in the artifact store`));
        return { ok: true, applied: true };
      }
      const pending: PendingPlan = {
        changes,
        captures: toRun,
        estimateGpuMin: +toRun.reduce((a, c) => a + c.estimateGpuMin, 0).toFixed(1),
        hosts: [...new Set(toRun.map((c) => c.host))],
        candidateBuildId: out.registry.buildId,
      };
      dispatch(setPending({ labId, pending }));
      dispatch(log('warn', `pending plan: ${changes.map((c) => `${c.urlKey} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join(', ')} · ${toRun.length} captures to execute`));
      return { ok: true, applied: false, pending };
    } catch (e) {
      const msg = e instanceof BuildError ? e.failure.message : String(e);
      dispatch(log('error', `candidate build failed: ${msg}`));
      return { ok: false, error: msg };
    }
  };

export const revertPlan =
  (labId: string): AppThunk =>
  (dispatch) => {
    dispatch(revertPending(labId));
    dispatch(log('info', 'reverted the pending plan'));
  };

/** A person reviewed the pending plan and runs it: the job is approved by construction. */
export const runPendingPlan =
  (labId: string): AppThunk =>
  (dispatch, getState) => {
    const pending = getState().params.byLab[labId]?.pending;
    if (!pending) return;
    dispatch(proposeJob({ labId, captures: pending.captures, reason: `pending plan: ${pending.changes.map((c) => c.urlKey).join(', ')}`, by: 'user' }));
  };
