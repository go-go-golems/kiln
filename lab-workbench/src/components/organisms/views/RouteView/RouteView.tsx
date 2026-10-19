import { useMemo } from 'react';
import { useBoard } from '@/app/board-context';
import { Chip } from '@/components/atoms/Chip';
import { EntityChip } from '@/components/molecules/EntityChip';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { isQuery, Query } from '@/lang/query';
import { isEnt, rows as toRows, type Ent, type Rows } from '@/lang/rows';
import { queryEnv } from '@/lang/runtime';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import './RouteView.css';

interface Hop {
  label: string;
  kind: 'start' | 'follow' | 'filter';
  count: number;
  evidence: Record<string, number>;
  methods: string[];
  sample: Ent[];
  missing?: string;
}

/** Walks a query one operator at a time and reports, per hop, how many entities it reached and on what evidence. */
export const RouteView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const result = useMemo(() => {
    try {
      const q = ctx.resolveLazy(view.args[0]);
      if (!isQuery(q)) return { hops: [] as Hop[], error: null };
      const env = queryEnv(ctx.reg, ctx.state);
      let cur = new Query(q.root).evaluate(env) as Rows<Ent>;
      const hops: Hop[] = [{ label: q.describe().split('.follow')[0].slice(0, 90), kind: 'start', count: cur.length, evidence: {}, methods: [], sample: [...cur].filter(isEnt).slice(0, 3) }];
      for (const op of q.ops) {
        const args = op.args.map((a) => (typeof a === 'function' ? a : env.resolveArg(a)));
        if (op.method === 'follow' || op.method === 'back') {
          const evidence: Record<string, number> = {};
          const methods = new Set<string>();
          for (const e of cur) {
            if (!isEnt(e)) continue;
            for (const rel of args as string[]) {
              for (const l of ctx.reg.source.links(e.ref, rel, op.method === 'follow' ? 'fwd' : 'back')) {
                evidence[l.evidence] = (evidence[l.evidence] ?? 0) + 1;
                if (l.method) methods.add(l.method);
              }
            }
          }
          const next = (cur as unknown as Record<string, (...a: unknown[]) => Rows<Ent>>)[op.method](...args);
          let missing: string | undefined;
          if (next.length === 0 && cur.length > 0) {
            const run = ctx.reg.source.entity(String(cur[0].run));
            const gaps = (run?.coverage as { links?: { missing: { rel: string; reason: string }[] } } | undefined)?.links?.missing ?? [];
            missing = gaps.find((g) => (args as string[]).includes(g.rel))?.reason ?? 'no link recorded for this relationship';
          }
          hops.push({ label: `${op.method === 'back' ? '←' : '→'} ${(args as string[]).join(' | ')}`, kind: 'follow', count: next.length, evidence, methods: [...methods], sample: [...next].slice(0, 3), missing });
          cur = next;
        } else {
          const next = (cur as unknown as Record<string, (...a: unknown[]) => unknown>)[op.method](...args);
          cur = (Array.isArray(next) ? next : next ? toRows([next]) : toRows([])) as Rows<Ent>;
          hops.push({ label: `.${op.method}(${args.map((a) => (typeof a === 'function' ? 'ƒ' : a instanceof RegExp ? String(a) : JSON.stringify(a))).join(', ')})`, kind: 'filter', count: cur.length, evidence: {}, methods: [], sample: [...cur].filter(isEnt).slice(0, 3) });
        }
      }
      return { hops, error: null };
    } catch (error) {
      return { hops: [] as Hop[], error };
    }
  }, [ctx.resolveLazy, ctx.reg, ctx.state, view]);
  if (result.error) return <Panel kind="route"><PanelError error={result.error} /></Panel>;
  const gaps = result.hops.filter((h) => h.missing || (h.kind === 'follow' && h.count === 0)).length;
  return (
    <Panel kind="route" footer={gaps ? `${gaps} hop${gaps > 1 ? 's' : ''} without evidence — the route stops there rather than guessing` : 'every hop is backed by a recorded relationship'}>
      {result.hops.length === 0 ? (
        <EmptyState title="No route" hint="Select a request to trace it to its kernel." />
      ) : (
        <ol className="route">
          {result.hops.map((h, i) => (
            <li key={i} className={`route__hop route__hop--${h.kind}${h.missing ? ' is-missing' : ''}`}>
              <div className="route__label mono">{h.label}</div>
              <div className="route__count num">{h.count}</div>
              <div className="route__ev">
                {Object.entries(h.evidence).map(([ev, n]) => (
                  <Chip key={ev} tone={ev === 'direct' ? 'neutral' : 'warn'} title={h.methods.join(', ')}>
                    {ev} ×{n}
                  </Chip>
                ))}
                {h.missing ? <span className="route__missing">missing · {h.missing}</span> : null}
              </div>
              <div className="route__sample">
                {h.sample.map((e) => (
                  <EntityChip key={e.ref} refId={e.ref} label={String(e.name ?? e.id)} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};
