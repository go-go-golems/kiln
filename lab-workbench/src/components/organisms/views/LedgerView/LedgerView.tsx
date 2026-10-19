import { useBoard } from '@/app/board-context';
import { useResolved } from '@/app/useResolved';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { isEnt, type Ent } from '@/lang/rows';
import { fmtBytes, getPath } from '@/lang/util';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './LedgerView.css';

/** One bar per group within a single ledger scope. Bars from different scopes are never summed. */
export const LedgerView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const r = useResolved(
    (res) => ({ rows: res(view.args[0]) as Ent[], group: String(res(view.p('groupBy')) ?? 'run'), scope: res(view.p('scope')) as string | undefined, title: res(view.p('title')) as string | undefined }),
    [view],
  );
  if (r.error) return <Panel kind="ledger"><PanelError error={r.error} /></Panel>;
  const rows = (Array.isArray(r.value?.rows) ? r.value!.rows : []).filter(isEnt);
  const scopes = [...new Set(rows.map((a) => String(a.scope)))];
  const groups = new Map<string, Ent[]>();
  for (const a of rows) {
    const k = String(getPath(a, r.value!.group) ?? '—');
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const totals = [...groups.entries()].map(([k, list]) => ({ k, list: [...list].sort((a, b) => Number(b.bytes) - Number(a.bytes)), total: list.reduce((s, a) => s + Number(a.bytes ?? 0), 0) }));
  const max = Math.max(1, ...totals.map((t) => t.total));
  return (
    <Panel
      kind="ledger"
      input={`scope ${r.value?.scope ?? scopes.join(', ')}`}
      title={r.value?.title}
      footer={`${rows.length} entries · totals add the listed entries regardless of when each was alive, within one scope (${scopes.join(', ') || '—'}); allocator, graph and process scopes overlap and are never added together`}
    >
      {rows.length === 0 ? (
        <EmptyState title="No ledger entries" hint="This scope has no entries in the imported memory captures." />
      ) : (
        <div className="ledger">
          {totals.map((t) => (
            <div key={t.k} className="ledger__row">
              <div className="ledger__label mono" title={t.k}>
                {t.k}
              </div>
              <div className="ledger__bar" style={{ width: `${(t.total / max) * 100}%` }}>
                {t.list.map((a, i) => (
                  <button
                    key={a.ref}
                    type="button"
                    className={`ledger__seg${a.retainedBy ? ' is-retained' : ''}${i % 2 ? ' is-alt' : ''}`}
                    style={{ flexGrow: Number(a.bytes) || 1 }}
                    title={`${String(a.name)} · ${fmtBytes(Number(a.bytes))} · ${String(a.lifetime ?? '')}${a.retainedBy ? ` · retained by ${String(a.retainedBy)}` : ''} · source ${String(a.source ?? '—')}`}
                    onClick={() => ctx.fire(view, 'select', { entity: a, row: a })}
                  >
                    <span className="sr-only">{String(a.name)}</span>
                  </button>
                ))}
              </div>
              <div className="ledger__total num">{fmtBytes(t.total)}</div>
            </div>
          ))}
          <div className="ledger__legend mono">
            <span>
              <i className="is-retained" /> retained by a graph generation
            </span>
            <span>
              <i /> released or request-scoped
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
};
