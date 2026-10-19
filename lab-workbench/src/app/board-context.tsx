import { createContext, useCallback, useContext, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { getRegistry } from './registry';
import { selectLabParams } from '@/features/params/paramsSlice';
import { changeParam } from '@/features/params/thunks';
import { select } from '@/features/selection/selectionSlice';
import { selectSignals, setSignal } from '@/features/signals/signalsSlice';
import { log } from '@/features/ui/uiSlice';
import type { ViewB } from '@/lang/builders';
import { isParamRef, isSignalRef } from '@/lang/refs';
import { isEnt } from '@/lang/rows';
import { dehydrate, makeDollar, materialize, resolveValue, type BuildRegistry, type RuntimeState } from '@/lang/runtime';

export interface BoardCtx {
  labId: string;
  boardId: string;
  reg: BuildRegistry;
  state: RuntimeState;
  /** Evaluate a view-slot value: params, signals, live lambdas, queries, comparisons. */
  resolve: (x: unknown) => unknown;
  /** Resolve params, signals and live lambdas but leave queries unevaluated (route views step through them). */
  resolveLazy: (x: unknown) => unknown;
  /** Write a signal or parameter (handlers, controls). */
  setRef: (ref: unknown, value: unknown) => void;
  /** Run a view's handlers for an event, and follow the selection in the inspector. */
  fire: (view: ViewB, event: string, payload: Record<string, unknown>) => void;
  stale: Set<string>;
}

const Ctx = createContext<BoardCtx | null>(null);
export const BoardProvider = Ctx.Provider;

export function useBoard(): BoardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useBoard outside a board');
  return c;
}

export function useLabBuild(labId: string) {
  const lb = useAppSelector((s) => s.build.byLab[labId]);
  return { lb, reg: getRegistry(lb?.buildId ?? undefined), ir: lb?.ir ?? null };
}

export function useRuntimeState(labId: string): RuntimeState {
  const lp = useAppSelector((s) => selectLabParams(s, labId));
  const signals = useAppSelector((s) => selectSignals(s, labId));
  return useMemo(() => ({ params: lp.applied, signals }), [lp.applied, signals]);
}

export function useBoardCtx(labId: string, boardId: string, reg: BuildRegistry | undefined, stale: Set<string>): BoardCtx | null {
  const dispatch = useAppDispatch();
  const state = useRuntimeState(labId);
  const setRef = useCallback(
    (ref: unknown, value: unknown) => {
      if (isSignalRef(ref)) dispatch(setSignal({ labId, key: ref.key, value: dehydrate(value) }));
      else if (isParamRef(ref)) dispatch(changeParam(labId, ref.key, value));
    },
    [dispatch, labId],
  );
  return useMemo(() => {
    if (!reg) return null;
    const resolve = (x: unknown) => materialize(reg, x, state);
    const resolveLazy = (x: unknown) => resolveValue(x, makeDollar(reg, state));
    const fire = (view: ViewB, event: string, payload: Record<string, unknown>) => {
      const ent = payload.entity ?? payload.row;
      if (event === 'select' && isEnt(ent)) dispatch(select(ent.ref));
      for (const h of view.handlers.filter((x) => x.event === event)) {
        try {
          h.fn(makeDollar(reg, state, { set: setRef, event: payload }));
        } catch (e) {
          dispatch(log('error', `handler .on('${event}'): ${(e as Error).message}`));
        }
      }
    };
    return { labId, boardId, reg, state, resolve, resolveLazy, setRef, fire, stale };
  }, [reg, state, labId, boardId, setRef, dispatch, stale]);
}
