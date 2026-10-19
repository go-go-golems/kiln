import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { BindingBadge } from '@/components/atoms/BindingBadge';
import { Button } from '@/components/atoms/Button';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { DataBlock } from '@/components/molecules/DataBlock';
import { Segmented } from '@/components/atoms/Segmented';
import { SelectBox } from '@/components/atoms/SelectBox';
import { TextField } from '@/components/atoms/TextField';
import { selectNode } from '@/features/selection/selectionSlice';
import { log } from '@/features/ui/uiSlice';
import type { IR, IRNode } from '@/lang/ir';
import './GraphTab.css';

const STATS: [string, string][] = [
  ['nodes', 'nodes'],
  ['experiments', 'experiments'],
  ['captures', 'captures'],
  ['derives', 'derives'],
  ['params', 'params'],
  ['planLambdas', 'ƒ plan'],
  ['dataLambdas', 'ƒ data'],
  ['liveLambdas', 'ƒ live'],
  ['lint', 'warnings'],
];

/** IR summary, passes, the board's dataflow, lints and the IR tree. */
export const GraphTab: React.FC<{ ir: IR; boardId: string }> = ({ ir, boardId }) => {
  const dispatch = useAppDispatch();
  const node = useAppSelector((s) => s.selection.node);
  const [scope, setScope] = useState<'board' | 'lab'>('board');
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState('all');
  const board = ir.boards.find((b) => b.id === boardId);
  const readers = useMemo(() => {
    const keys = new Set(board?.paramKeys ?? []);
    return ir.params.filter((p) => scope === 'lab' || keys.has(p.key)).map((p) => ({ p, readers: p.readers }));
  }, [ir, board, scope]);
  const children = useMemo(() => {
    const m = new Map<string, IRNode[]>();
    for (const n of ir.nodes) m.set(n.parent ?? '', [...(m.get(n.parent ?? '') ?? []), n]);
    return m;
  }, [ir]);
  const match = (n: IRNode) => (kind === 'all' || n.kind === kind) && (!filter || `${n.id} ${n.label} ${n.detail ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const inScope = (n: IRNode) => scope === 'lab' || !n.id.startsWith('board:') || n.id === `board:${boardId}`;
  const tree = (parent: string, depth: number): React.ReactNode[] =>
    (children.get(parent) ?? [])
      .filter(inScope)
      .flatMap((n) => {
        const sub = tree(n.id, depth + 1);
        if (!match(n) && sub.length === 0) return [];
        return [
          <li key={n.id} style={{ paddingLeft: depth * 12 }}>
            <button type="button" className={`irtree__node${n.id === node ? ' is-on' : ''}`} onClick={() => dispatch(selectNode(n.id === node ? null : n.id))}>
              <span className={`irtree__kind irtree__kind--${n.kind}`}>{n.kind}</span>
              <span className="irtree__label">{n.label}</span>
              {n.status ? <Chip tone={n.status === 'cached' ? 'neutral' : n.status === 'execute' ? 'warn' : n.status === 'import' ? 'sig' : 'bad'}>{n.status}</Chip> : null}
              {n.binding ? <BindingBadge binding={n.binding} /> : null}
              {n.detail ? <span className="irtree__detail">{n.detail}</span> : null}
            </button>
          </li>,
          ...sub,
        ];
      });
  const selected = ir.nodes.find((n) => n.id === node);
  const edges = selected ? ir.edges.filter((e) => e.from === selected.id || e.to === selected.id) : [];
  return (
    <div className="gtab">
      <div className="gtab__bar">
        <Segmented
          size="sm"
          label="Graph scope"
          value={scope}
          onChange={(v) => setScope(v as 'board' | 'lab')}
          options={[
            { value: 'board', label: 'This board' },
            { value: 'lab', label: 'Whole lab' },
          ]}
        />
        <Button
          size="sm"
          icon="copy"
          onClick={() => {
            void navigator.clipboard?.writeText(JSON.stringify({ ...ir, nodes: ir.nodes, edges: ir.edges }, null, 2));
            dispatch(log('info', `copied IR v${ir.version} (${ir.nodes.length} nodes, ${ir.edges.length} edges) to the clipboard`));
          }}
        >
          Copy IR
        </Button>
        <span className="muted mono gtab__ver">v{ir.version} · {ir.durationMs} ms</span>
      </div>
      <div className="gtab__stats">
        {STATS.map(([k, label]) => (
          <div key={k}>
            <span className="num">{ir.stats[k] ?? 0}</span>
            <Eyebrow>{label}</Eyebrow>
          </div>
        ))}
      </div>
      <section>
        <Eyebrow as="h3" tone="accent">Dataflow · parameters → readers</Eyebrow>
        {readers.length ? (
          <ul className="gtab__flow">
            {readers.map(({ p, readers: rs }) => (
              <li key={p.key}>
                <span className="gtab__param mono">{p.urlKey}</span>
                <BindingBadge binding={p.binding} />
                <span className="gtab__readers mono">{rs.length ? rs.map((r) => r.replace(/^experiment:/, '').replace(/^view:[^/]+\//, '')).join(' · ') : 'no readers'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted gtab__empty">No parameters reach this board.</p>
        )}
      </section>
      <section>
        <Eyebrow as="h3" tone="accent">Passes · in order</Eyebrow>
        <table className="gtab__passes">
          <tbody>
            {ir.passes.map((p) => (
              <tr key={p.n}>
                <td className="num gtab__n">{String(p.n).padStart(2, '0')}</td>
                <th scope="row">{p.name}</th>
                <td>{p.detail}</td>
                <td className="num muted">{p.ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {ir.lint.length ? (
        <section>
          <Eyebrow as="h3" tone="accent">Lint</Eyebrow>
          <ul className="gtab__lint">
            {ir.lint.map((l, i) => (
              <li key={i} className={`gtab__lint--${l.level}`}>
                <span className="mono">{l.code}</span> {l.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <div className="gtab__treehead">
          <Eyebrow as="h3" tone="accent">IR tree</Eyebrow>
          <TextField label="Filter IR nodes" value={filter} onChange={setFilter} placeholder="filter…" />
          <SelectBox
            label="Node kind"
            value={kind}
            onChange={setKind}
            options={[{ value: 'all', label: 'all kinds' }, ...[...new Set(ir.nodes.map((n) => n.kind))].map((k) => ({ value: k, label: k }))]}
          />
        </div>
        <ul className="irtree">{tree('', 0)}</ul>
      </section>
      {selected ? (
        <section>
          <Eyebrow as="h3" tone="accent">Node · {selected.id}</Eyebrow>
          <ul className="gtab__edges mono">
            {edges.map((e, i) => (
              <li key={i}>
                {e.from === selected.id ? `→ ${e.kind} → ${e.to}` : `← ${e.kind} ← ${e.from}`}
              </li>
            ))}
          </ul>
          <DataBlock className="gtab__json" value={selected} label={`node · ${selected.kind}`} />
        </section>
      ) : null}
    </div>
  );
};
