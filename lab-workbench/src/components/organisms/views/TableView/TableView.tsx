import { useMemo, useState } from 'react';
import { useBoard } from '@/app/board-context';
import { useAppSelector } from '@/app/hooks';
import { useResolved } from '@/app/useResolved';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { ValueCell } from '@/components/molecules/ValueCell';
import { EmptyState } from '@/components/molecules/EmptyState';
import { isQuery } from '@/lang/query';
import { FIELD_UNITS, isEnt } from '@/lang/rows';
import { getPath } from '@/lang/util';
import { isValue } from '@/lang/values';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './TableView.css';

const LIMIT = 200;

const inferCols = (row: Record<string, unknown>): string[] =>
  Object.keys(row).filter((k) => {
    const v = row[k];
    return !['kind', 'ref', 'run', 'metrics', 'manifest'].includes(k) && (v === null || typeof v !== 'object' || isValue(v) || Array.isArray(v));
  }).slice(0, 8);

export const TableView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const sel = useAppSelector((s) => s.selection.sel);
  const [cursor, setCursor] = useState(0);
  const input = view.args[0];
  const r = useResolved(
    (res) => {
      const rows = res(input);
      const cols = (view.pa('cols') ?? []).map((c) => res(c)).flat() as string[];
      const title = res(view.p('title'));
      return { rows: Array.isArray(rows) ? rows : rows == null ? [] : [rows], cols, title };
    },
    [view],
  );
  const describe = isQuery(input) ? input.describe() : undefined;
  const rows = (r.value?.rows ?? []) as Record<string, unknown>[];
  const cols = useMemo(() => (r.value?.cols?.length ? r.value.cols : rows[0] ? inferCols(rows[0]) : []), [r.value, rows]);
  if (r.error) return <Panel kind="table" input={describe}><PanelError error={r.error} /></Panel>;
  const shown = rows.slice(0, LIMIT);
  const pick = (i: number) => {
    const row = shown[i];
    if (!row) return;
    setCursor(i);
    ctx.fire(view, 'select', { row, entity: isEnt(row) ? row : undefined });
  };
  return (
    <Panel
      kind="table"
      input={describe}
      title={r.value?.title ? String(r.value.title) : undefined}
      footer={`${rows.length} rows${rows.length > LIMIT ? ` · showing ${LIMIT}` : ''}${rows.some((x) => (x as { __prov?: string }).__prov === 'derived') ? ' · ◐ derived aggregates' : ''}`}
      flush
    >
      {rows.length === 0 ? (
        <EmptyState title="No rows" hint="Nothing matches, or the capture that produces these rows has not been imported. Check PLAN." />
      ) : (
        <div className="tableview">
          <table>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} scope="col" title={c}>
                    {c.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\./g, ' · ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              onKeyDown={(e) => {
                const body = e.currentTarget;
                const move = (next: number) => {
                  e.preventDefault();
                  setCursor(next);
                  requestAnimationFrame(() => (body.children[next] as HTMLElement | undefined)?.focus());
                };
                if (e.key === 'ArrowDown') move(Math.min(shown.length - 1, cursor + 1));
                if (e.key === 'ArrowUp') move(Math.max(0, cursor - 1));
                if (e.key === 'Enter') (e.preventDefault(), pick(cursor));
              }}
            >
              {shown.map((row, i) => {
                const isSel = isEnt(row) && row.ref === sel;
                return (
                  <tr
                    key={isEnt(row) ? row.ref : i}
                    tabIndex={i === cursor ? 0 : -1}
                    aria-selected={isSel}
                    className={isSel ? 'is-selected' : i === cursor ? 'is-cursor' : ''}
                    onClick={() => pick(i)}
                  >
                    {cols.map((c) => {
                      const v = getPath(row, c);
                      const unit = FIELD_UNITS[c.split('.').pop() ?? c] ?? FIELD_UNITS[c.split('.')[0]];
                      const numeric = typeof v === 'number' || isValue(v);
                      return (
                        <td key={c} className={numeric ? 'is-num' : ''}>
                          {numeric || v === null || v === undefined ? (
                            <ValueCell value={v} unit={isValue(v) ? undefined : unit} align={numeric ? 'right' : 'left'} />
                          ) : (
                            <span className="tableview__text" title={String(v)}>
                              {typeof v === 'boolean' ? (v ? 'yes' : 'no') : Array.isArray(v) ? `[${v.join(', ')}]` : String(v)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};
