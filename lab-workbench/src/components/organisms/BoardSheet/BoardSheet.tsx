import { useMemo } from 'react';
import { BoardProvider, useBoardCtx } from '@/app/board-context';
import { useAppSelector } from '@/app/hooks';
import { useWidth } from '@/hooks/useWidth';
import { selectLabParams } from '@/features/params/paramsSlice';
import type { IR } from '@/lang/ir';
import { isLive, type LiveFn } from '@/lang/refs';
import { makeDollar, type BuildRegistry } from '@/lang/runtime';
import { ViewRenderer } from '../ViewRenderer';
import { RichText } from '@/components/molecules/RichText';
import './BoardSheet.css';

const Mark: React.FC<{ className: string }> = ({ className }) => (
  <svg className={`sheet__mark sheet__mark--${className}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <circle cx="9" cy="9" r="4.5" fill="none" />
    <path d="M9 0v18M0 9h18" />
  </svg>
);

/** The board as a sheet on the drafting table: dimension label, title, panels and a title block. */
/** What the board's evidence is: generated from hashes, measured on a host, both, or nothing yet. */
function dataOrigin(reg: BuildRegistry, experiments: string[]): string {
  const runs = experiments.flatMap((e) => reg.source.runs(`${e}/*/*`));
  if (!runs.length) return experiments.length ? 'NO RUNS IMPORTED' : 'ILLUSTRATIVE DATA';
  const measured = runs.filter((r) => r.synthetic === false);
  if (!measured.length) return 'SYNTHETIC DATA';
  const hosts = [...new Set(measured.map((r) => String(r.host)))].join(', ').toUpperCase();
  return measured.length === runs.length ? `MEASURED ON ${hosts}` : `MEASURED ON ${hosts} + SYNTHETIC`;
}

export const BoardSheet: React.FC<{ labId: string; boardId: string; reg: BuildRegistry; ir: IR }> = ({ labId, boardId, reg, ir }) => {
  const pending = useAppSelector((s) => selectLabParams(s, labId).pending);
  const summary = ir.boards.find((b) => b.id === boardId)!;
  const board = reg.boards.get(boardId)!;
  const stale = useMemo(() => {
    const exps = new Set(pending?.captures.map((c) => c.experiment) ?? []);
    return new Set(summary.experiments.filter((e) => exps.has(e)));
  }, [pending, summary.experiments]);
  const ctx = useBoardCtx(labId, boardId, reg, stale);
  const [wrap, width] = useWidth<HTMLDivElement>(900);
  if (!ctx) return null;
  const $ = makeDollar(reg, ctx.state);
  const text = (x: unknown) => {
    try {
      return x === undefined ? undefined : String(isLive(x) ? (x as LiveFn).fn($) : x);
    } catch (e) {
      return `⚠ ${(e as Error).message}`;
    }
  };
  const title = text(board.titleText) ?? board.id;
  const subtitle = text(board.subtitleText);
  const runs = summary.experiments.flatMap((e) => reg.source.runs(`${e}/*/*`));
  const gaps = runs.filter((r) => !(r.coverage as { complete: boolean }).complete).length;
  const invalid = runs.filter((r) => !(r.validity as { ok: boolean }).ok).length;
  const named = new Map(board.views.filter((v) => v.name).map((v) => [v.name!, v]));
  const rows = board.areas?.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
  const useGrid = rows.length > 0 && width > 860;
  const placed = useGrid ? board.views.filter((v) => v.name && rows.some((r) => r.split(/\s+/).includes(v.name!))) : [];
  const rest = board.views.filter((v) => !placed.includes(v));
  const cols = rows[0]?.split(/\s+/).length ?? 1;
  return (
    <BoardProvider value={ctx}>
      <div className="sheetwrap" ref={wrap}>
        <div className="sheet__dims mono">
          B-{String(summary.index + 1).padStart(2, '0')} · {runs.length} run{runs.length === 1 ? '' : 's'} · {summary.experiments.length} experiment{summary.experiments.length === 1 ? '' : 's'}
          {invalid ? ` · ${invalid} invalid` : ''} · coverage {gaps ? `${gaps} with gaps` : 'complete'}
          {stale.size ? <span className="sheet__stale"> · stale for current parameters</span> : null}
        </div>
        <article className={`sheet${stale.size ? ' is-stale' : ''}`} aria-labelledby="sheet-title">
          <Mark className="tl" />
          <Mark className="tr" />
          <Mark className="bl" />
          <Mark className="br" />
          <header className="sheet__head">
            <h1 id="sheet-title">
              <RichText text={title} />
            </h1>
            {subtitle ? (
              <p className="sheet__sub">
                <RichText text={subtitle} />
              </p>
            ) : null}
          </header>
          {stale.size ? (
            <div className="sheet__stalebanner" role="note">
              The panels below were produced with the applied parameters. The pending plan changes {[...stale].join(', ')}, which has no evidence until the plan runs.
            </div>
          ) : null}
          {useGrid ? (
            <div className="sheet__grid" style={{ gridTemplateAreas: rows.map((r) => `"${r}"`).join(' '), gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {[...named.entries()]
                .filter(([n]) => placed.some((p) => p.name === n))
                .map(([n, v]) => (
                  <div key={v.id} style={{ gridArea: n, minWidth: 0 }}>
                    <ViewRenderer view={v} />
                  </div>
                ))}
            </div>
          ) : null}
          <div className="sheet__stack">
            {rest.map((v) => (
              <ViewRenderer key={v.id} view={v} />
            ))}
          </div>
          <footer className="sheet__titleblock mono">
            <span>PERF LAB — {ir.title}</span>
            <span>
              BOARD B-{String(summary.index + 1).padStart(2, '0')} OF {ir.boards.length}
            </span>
            <span>{summary.paramKeys.length} PARAMS</span>
            <span>BUILD {ir.buildId.replace('build-', '')}</span>
            <span>{dataOrigin(reg, summary.experiments)}</span>
          </footer>
        </article>
      </div>
    </BoardProvider>
  );
};
