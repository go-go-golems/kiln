import type { AppThunk } from '@/app/store';
import { getPatches, registerBuild } from '@/app/registry';
import { appEnv, syntheticEnv } from '@/data/env';
import { toWire } from '@/features/catalog/wire';
import { loadMeasured } from '@/features/server/thunks';
import { server } from '@/services/server';
import { build, BuildError, type BuildOutput } from '@/lang/build';
import { seed } from '@/features/catalog/catalogSlice';
import { selectSource } from '@/features/program/programSlice';
import { log } from '@/features/ui/uiSlice';
import { buildFailed, buildSucceeded } from './buildSlice';
import { evaluatePending } from '@/features/params/thunks';

/**
 * Build a lab with its *applied* parameters. A pending plan stays pending; it is re-evaluated against
 * the new program afterwards.
 */
export const buildLab =
  (labId: string, reason = 'build'): AppThunk<BuildOutput | null> =>
  (dispatch, getState) => {
    const state = getState();
    const source = selectSource(state, labId);
    const patches = getPatches(labId);
    try {
      if (!state.catalog.seededLabs[labId]) {
        // default-parameter captures exist as synthetic artifacts; captures on a host with a real executor
        // (local) never do: they must be measured
        const s = build({ source, labId, params: {}, env: syntheticEnv(new Set()), seedMode: true, patches });
        const synthetic = s.ir.plan.captures.filter((c) => c.host !== 'local');
        dispatch(seed({ labId, hashes: synthetic.map((c) => c.hash), origin: state.server.status === 'online' ? 'synthetic' : 'seed' }));
        if (state.server.status === 'online' && synthetic.length)
          void server.post(`/labs/${encodeURIComponent(labId)}/seed`, { captures: synthetic.map(toWire) }).catch((e: Error) => dispatch(log('warn', `seed not stored on the server: ${e.message}`)));
      }
      const now = getState();
      const out = build({
        source,
        labId,
        params: now.params.byLab[labId]?.applied ?? {},
        env: appEnv(now.catalog.available),
        patches,
      });
      registerBuild(out.registry);
      dispatch(buildSucceeded({ labId, buildId: out.registry.buildId, ir: out.ir }));
      const errors = out.ir.lint.filter((l) => l.level === 'error').length;
      const warnings = out.ir.lint.filter((l) => l.level === 'warning').length;
      dispatch(
        log(
          errors ? 'warn' : 'ok',
          `${reason}: ${out.ir.title} in ${out.ir.durationMs} ms · ${out.ir.stats.nodes} nodes · ${out.ir.stats.edges} edges · ${errors} errors · ${warnings} warnings`,
        ),
      );
      for (const l of out.ir.lint.filter((x) => x.level !== 'info')) dispatch(log(l.level === 'error' ? 'error' : 'warn', `${l.code}: ${l.message}`));
      if (getState().params.byLab[labId]?.pending) dispatch(evaluatePending(labId));
      // measured captures this build refers to but the browser has not fetched: load, then rebuild
      if (getState().server.status === 'online') void dispatch(loadMeasured(labId));
      return out;
    } catch (e) {
      const failure = e instanceof BuildError ? e.failure : { message: String((e as Error)?.stack ?? e) };
      dispatch(buildFailed({ labId, failure }));
      dispatch(log('error', `${failure.message}${failure.line ? ` (lab.js:${failure.line})` : ''}`, failure.line));
      return null;
    }
  };
