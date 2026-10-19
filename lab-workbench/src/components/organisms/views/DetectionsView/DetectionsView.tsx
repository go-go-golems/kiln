import { useMemo, useState } from 'react';
import { useBoard } from '@/app/board-context';
import { useAppSelector } from '@/app/hooks';
import { useResolved } from '@/app/useResolved';
import { Chip } from '@/components/atoms/Chip';
import { Segmented } from '@/components/atoms/Segmented';
import { DetectionOverlay, OverlayLegend } from '@/components/molecules/DetectionOverlay/DetectionOverlay';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import type { Ent } from '@/lang/rows';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import { datasetSha, evidenceFor, layersFor } from './evidence';
import './DetectionsView.css';

const STATUS_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'bad'> = { exact: 'neutral', 'within-tolerance': 'ok', changed: 'warn', added: 'bad', dropped: 'bad' };

/**
 * One image with its ground truth and every prediction run's boxes. The SVG is decorative; the table beside it
 * carries every box in text and is how a keyboard reaches them: focusing a row outlines its box.
 */
export const DetectionsView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const sel = useAppSelector((s) => s.selection.sel);
  const [focus, setFocus] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'all' | 'diff'>(view.p('diff') ? 'diff' : 'all');
  const r = useResolved(
    (res) => ({ ds: datasetSha(res(view.args[0])), imageId: Number(res(view.args[1])), runs: view.p('runs') ? String(res(view.p('runs'))) : undefined, title: res(view.p('title')) as string | undefined }),
    [view],
  );
  const ev = useMemo(() => (r.value ? evidenceFor(ctx.reg.source, r.value.ds, r.value.imageId, r.value.runs) : null), [r.value, ctx.reg.source]);
  if (r.error) return <Panel kind="detections"><PanelError error={r.error} /></Panel>;
  if (!ev || !r.value) return null;
  const input = `${r.value.ds.slice(0, 8)} · image ${r.value.imageId}${r.value.runs ? ` · ${r.value.runs}` : ''}`;
  if (!ev.image)
    return (
      <Panel kind="detections" input={input}>
        <EmptyState title={`No image ${r.value.imageId} in this dataset`} hint="The dataset is not registered on the lab server, or the id is not part of it." />
      </Panel>
    );
  const im = ev.image;
  const W = Number(im.width);
  const H = Number(im.height);
  const all = layersFor(ev, { diff: mode === 'diff' });
  const layers = all.filter((l) => !hidden.has(l.key));
  const rows: { layer: string; ent: Ent }[] = [
    ...(hidden.has('truth') ? [] : ev.truth.map((ent) => ({ layer: 'ground truth', ent }))),
    ...ev.arms
      .filter((a) => !hidden.has(a.run))
      .flatMap((a) => (mode === 'diff' ? a.detections.filter((d) => d.status !== 'exact') : a.detections).map((ent) => ({ layer: all.find((l) => l.key === a.run)?.label ?? a.arm, ent }))),
  ];
  const px = (b: unknown, i: number) => Math.round(((b as number[])[i] ?? 0) * (i % 2 ? H : W) * 10) / 10;
  const unrecorded = ev.arms.filter((a) => !a.recorded);
  return (
    <Panel
      kind="detections"
      input={input}
      title={r.value.title ?? `${String(im.fileName)} · ${W} × ${H}`}
      actions={
        <Segmented
          size="sm"
          label="Boxes shown"
          value={mode}
          onChange={(v) => setMode(v as 'all' | 'diff')}
          options={[
            { value: 'all', label: 'All' },
            { value: 'diff', label: 'Differences' },
          ]}
        />
      }
      footer={
        <span className="detv__foot">
          {String(im.strata)} · {im.license ? <a href={String(im.licenseUrl ?? '#')} target="_blank" rel="noreferrer">{String(im.license)}</a> : 'licence unknown'}
          {im.pageUrl ? (
            <>
              {' · '}
              <a href={String(im.pageUrl)} target="_blank" rel="noreferrer">source</a>
            </>
          ) : null}
          {unrecorded.length ? ` · ${unrecorded.map((a) => a.arm).join(', ')}: no prediction record for this image (the report keeps an output digest only)` : ''}
        </span>
      }
    >
      <div className="detv-wrap">
      <div className="detv">
        <figure className="detv__figure">
          <DetectionOverlay width={W} height={H} src={im.mediaUrl ? String(im.mediaUrl) : null} alt={`Image ${String(im.imageId)}, ${W} by ${H} pixels`} layers={layers} focus={focus ?? (rows.some((x) => x.ent.ref === sel) ? sel : null)} />
          <figcaption>
            <OverlayLegend layers={all} hidden={hidden} onToggle={(k) => setHidden((h) => new Set(h.has(k) ? [...h].filter((x) => x !== k) : [...h, k]))} />
          </figcaption>
        </figure>
        <div className="detv__table">
          {rows.length === 0 ? (
            <EmptyState title={mode === 'diff' ? 'No differences' : 'No boxes'} hint={mode === 'diff' ? 'Every detection of every arm is identical for this image.' : 'No layer has a box for this image.'} />
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">layer</th>
                  <th scope="col">label</th>
                  <th scope="col" className="is-num">conf.</th>
                  <th scope="col" className="is-num">x1, y1 – x2, y2 (px)</th>
                  <th scope="col">vs. other arm</th>
                  <th scope="col">truth</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ layer, ent }) => {
                  const isDet = ent.kind === 'detection';
                  return (
                    <tr
                      key={ent.ref}
                      tabIndex={0}
                      aria-selected={sel === ent.ref}
                      className={sel === ent.ref ? 'is-selected' : ''}
                      onFocus={() => setFocus(ent.ref)}
                      onBlur={() => setFocus(null)}
                      onMouseEnter={() => setFocus(ent.ref)}
                      onMouseLeave={() => setFocus(null)}
                      onClick={() => ctx.fire(view, 'select', { entity: ent })}
                      onKeyDown={(e) => {
                        const row = e.currentTarget;
                        if (e.key === 'ArrowDown') (e.preventDefault(), (row.nextElementSibling as HTMLElement | null)?.focus());
                        if (e.key === 'ArrowUp') (e.preventDefault(), (row.previousElementSibling as HTMLElement | null)?.focus());
                        if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), ctx.fire(view, 'select', { entity: ent }));
                      }}
                    >
                      <td>{layer}</td>
                      <td>{String(ent.label)}</td>
                      <td className="is-num">{isDet ? Number(ent.confidence).toFixed(4) : '—'}</td>
                      <td className="is-num mono">
                        {px(ent.bbox, 0)}, {px(ent.bbox, 1)} – {px(ent.bbox, 2)}, {px(ent.bbox, 3)}
                      </td>
                      <td>{isDet ? <Chip tone={STATUS_TONE[String(ent.status)] ?? 'neutral'} variant="tint">{String(ent.status)}</Chip> : ''}</td>
                      <td className="mono">{isDet ? (ent.gt !== null && ent.gt !== undefined ? `#${String(ent.gt)} · IoU ${Number(ent.iou).toFixed(2)}` : ent.truthKnown ? 'false positive' : '—') : `#${String(ent.id)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>
    </Panel>
  );
};
