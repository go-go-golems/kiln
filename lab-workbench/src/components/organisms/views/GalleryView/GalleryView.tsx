import { useMemo, useRef, useState } from 'react';
import { useBoard } from '@/app/board-context';
import { useResolved } from '@/app/useResolved';
import { Chip } from '@/components/atoms/Chip';
import { Segmented } from '@/components/atoms/Segmented';
import { DetectionOverlay } from '@/components/molecules/DetectionOverlay/DetectionOverlay';
import { EmptyState } from '@/components/molecules/EmptyState';
import { Panel, PanelError } from '@/components/molecules/Panel/Panel';
import { isQuery } from '@/lang/query';
import { isEnt, type Ent } from '@/lang/rows';
import type { ViewProps } from '../../ViewRenderer/ViewRenderer';
import { evidenceFor, layersFor, verdictOf, type ImageEvidence } from '../DetectionsView/evidence';
import './GalleryView.css';

type Filter = 'all' | 'recorded' | 'differs' | 'negatives';
const VERDICT_TONE = { exact: 'neutral', differs: 'bad', 'digest only': 'neutral', 'no runs': 'neutral' } as const;

/**
 * A dataset's images as a grid. Each tile shows the ground truth (dashed) and the last arm's boxes (thin), a
 * caption and a one-word verdict. Arrow keys move through the grid, Enter selects; the board decides what a
 * selection does (.on('select', $ => $.set(image, $.entity.imageId))).
 */
export const GalleryView: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const grid = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>(['all', 'recorded', 'differs', 'negatives'].includes(String(view.p('filter'))) ? (view.p('filter') as Filter) : 'all');
  const input = view.args[0];
  const r = useResolved(
    (res) => {
      const rows = res(input);
      return {
        images: (Array.isArray(rows) ? rows : []).filter((x): x is Ent => isEnt(x) && x.kind === 'image'),
        runs: view.p('runs') ? String(res(view.p('runs'))) : undefined,
        selected: view.p('selected') === undefined ? undefined : Number(res(view.p('selected'))),
        title: res(view.p('title')) as string | undefined,
      };
    },
    [view],
  );
  const items = useMemo(() => {
    if (!r.value) return [];
    return r.value.images.map((im) => {
      const ev: ImageEvidence = evidenceFor(ctx.reg.source, String(im.dataset), Number(im.imageId), r.value!.runs);
      return { im, ev, verdict: verdictOf(ev) };
    });
  }, [r.value, ctx.reg.source]);
  if (r.error) return <Panel kind="gallery"><PanelError error={r.error} /></Panel>;
  const shown = items.filter(({ im, ev, verdict }) =>
    filter === 'all' ? true : filter === 'recorded' ? ev.arms.length > 0 && ev.arms.every((a) => a.recorded) : filter === 'differs' ? verdict === 'differs' : Boolean(im.negative),
  );
  const counts = { recorded: items.filter((x) => x.verdict === 'exact' || x.verdict === 'differs').length, differs: items.filter((x) => x.verdict === 'differs').length };
  const present = items.filter((x) => x.im.present).length;

  const move = (from: number, key: string) => {
    const tiles = [...(grid.current?.querySelectorAll<HTMLButtonElement>('.gal__tile') ?? [])];
    if (!tiles.length) return;
    const top = tiles[0].offsetTop;
    const cols = Math.max(1, tiles.filter((t) => t.offsetTop === top).length);
    const to = { ArrowRight: from + 1, ArrowLeft: from - 1, ArrowDown: from + cols, ArrowUp: from - cols, Home: 0, End: tiles.length - 1 }[key];
    if (to === undefined) return false;
    tiles[Math.max(0, Math.min(tiles.length - 1, to))]?.focus();
    return true;
  };

  return (
    <Panel
      kind="gallery"
      input={isQuery(input) ? input.describe() : undefined}
      title={r.value?.title}
      actions={
        <Segmented
          size="sm"
          label="Images shown"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'all', label: `All ${items.length}` },
            { value: 'recorded', label: `Predicted ${counts.recorded}` },
            { value: 'differs', label: `Differs ${counts.differs}` },
            { value: 'negatives', label: 'Negatives' },
          ]}
        />
      }
      footer={`${shown.length} of ${items.length} images · ${present} fetched${present < items.length ? ' (pnpm lab datasets materialize <dataset>)' : ''} · dashed: ground truth · thin: ${items[0]?.ev.arms.at(-1)?.arm ?? 'no run'}${r.value?.runs ? '' : ' · no prediction runs named'}`}
    >
      {shown.length === 0 ? (
        <EmptyState title="No images match" hint={items.length ? 'Choose another filter.' : 'The dataset is not registered on the lab server, or this query selects none of its images.'} />
      ) : (
        <div className="gal" ref={grid} role="listbox" aria-label="Images" aria-orientation="horizontal">
          {shown.map(({ im, ev, verdict }, i) => {
            const layers = layersFor(ev).filter((l, k, all) => l.key === 'truth' || k === all.length - 1);
            const selected = r.value?.selected === im.imageId;
            const det = ev.arms.map((a) => `${a.arm[0]} ${a.recorded ? a.detections.length : '–'}`).join(' · ');
            return (
              <button
                key={im.ref}
                type="button"
                role="option"
                aria-selected={selected}
                className={`gal__tile${selected ? ' is-selected' : ''}`}
                tabIndex={selected || (r.value?.selected === undefined && i === 0) ? 0 : -1}
                onClick={() => ctx.fire(view, 'select', { entity: im })}
                onKeyDown={(e) => {
                  if (move(i, e.key)) e.preventDefault();
                }}
              >
                <DetectionOverlay compact frame={4 / 3} width={Number(im.width)} height={Number(im.height)} src={im.mediaUrl ? String(im.mediaUrl) : null} alt="" layers={layers} />
                <span className="gal__cap mono">
                  <span>{String(im.imageId)}</span>
                  <span className="gal__strata">{String(im.strata)}</span>
                </span>
                <span className="gal__meta mono">
                  <span>{String(im.annotations)} GT{det ? ` · ${det}` : ''}</span>
                  <Chip tone={VERDICT_TONE[verdict]} variant={verdict === 'differs' ? 'tint' : 'outline'}>
                    {verdict}
                  </Chip>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
};
