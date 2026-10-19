import { useResolved } from '@/app/useResolved';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { EmptyState } from '@/components/molecules/EmptyState';
import { isEnt } from '@/lang/rows';
import { sourceLink } from '@/lib/format';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';

export const SourceRef: React.FC<{ refText: string; evidence?: string }> = ({ refText, evidence }) => {
  const l = sourceLink(refText);
  return (
    <span className="mono" style={{ fontSize: 11 }}>
      {l.url ? (
        <a href={l.url} target="_blank" rel="noreferrer">
          {l.rev ? `${l.rev}:` : ''}
          {l.path}
          {l.symbol ? `#${l.symbol}` : ''}
        </a>
      ) : (
        refText
      )}
      {evidence ? <span className="muted"> · {evidence}</span> : null}
    </span>
  );
};

export const SourceView: React.FC<ViewProps> = ({ view }) => {
  const r = useResolved((res) => res(view.args[0]), [view]);
  if (r.error) return <PanelError error={r.error} />;
  const v = r.value as unknown;
  const ref = isEnt(v) ? (v.source as string | null) : typeof v === 'object' && v !== null && 'ref' in v ? String((v as { ref: string }).ref) : (v as string | null);
  return (
    <Panel kind="source">
      {ref ? <SourceRef refText={ref} /> : <EmptyState title="No source mapping" hint={isEnt(v) ? String(v.sourceReason ?? '') : 'Select a kernel with a source map'} />}
    </Panel>
  );
};
