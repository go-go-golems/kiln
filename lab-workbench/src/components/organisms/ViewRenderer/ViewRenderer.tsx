import { Component, type ErrorInfo } from 'react';
import { useBoard } from '@/app/board-context';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { PanelError } from '@/components/molecules/Panel/Panel';
import type { ViewB } from '@/lang/builders';
import { BatchView } from '../views/BatchView';
import { ChartView } from '../views/ChartView';
import { ControlView } from '../views/ControlView';
import { DetectionsView } from '../views/DetectionsView';
import { GalleryView } from '../views/GalleryView';
import { HypothesisView } from '../views/HypothesisView';
import { KernelCardView } from '../views/KernelCardView';
import { LedgerView } from '../views/LedgerView';
import { ManifestDiffView, ManifestView } from '../views/ManifestView';
import { MirrorView } from '../views/MirrorView';
import { MathView, NoteView, TextView } from '../views/TextView';
import { RouteView } from '../views/RouteView';
import { RunListView } from '../views/RunListView';
import { SourceView } from '../views/SourceView';
import { StatView } from '../views/StatView';
import { StepperView } from '../views/StepperView';
import { TableView } from '../views/TableView';
import { TimelineView } from '../views/TimelineView';
import './ViewRenderer.css';

export interface ViewProps {
  view: ViewB;
}

class Boundary extends Component<{ children: React.ReactNode; kind: string }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(_e: unknown, _i: ErrorInfo) {}
  render() {
    return this.state.error ? <PanelError error={this.state.error} /> : this.props.children;
  }
}

const VIEWS: Record<string, React.FC<ViewProps>> = {
  table: TableView,
  chart: ChartView,
  timeline: TimelineView,
  stat: StatView,
  manifest: ManifestView,
  manifestDiff: ManifestDiffView,
  mirror: MirrorView,
  kernelCard: KernelCardView,
  metrics: KernelCardView,
  ledger: LedgerView,
  stepper: StepperView,
  route: RouteView,
  hypothesisCard: HypothesisView,
  note: NoteView,
  math: MathView,
  text: TextView,
  source: SourceView,
  runList: RunListView,
  control: ControlView,
  batchView: BatchView,
  detections: DetectionsView,
  gallery: GalleryView,
};

/** Layout containers live here so they can recurse without an import cycle. */
const Layout: React.FC<ViewProps> = ({ view }) => {
  const ctx = useBoard();
  const gap = Number(view.p('gap') ?? 12);
  if (view.kind === 'split') {
    const sizes = (view.args[0] as number[] | undefined) ?? [1, 1];
    return (
      <div className="layout-split" style={{ gridTemplateColumns: sizes.map((s) => `minmax(0, ${s}fr)`).join(' '), gap }}>
        <div>{view.slots.left ? <ViewRenderer view={view.slots.left} /> : null}</div>
        <div>{view.slots.right ? <ViewRenderer view={view.slots.right} /> : null}</div>
      </div>
    );
  }
  if (view.kind === 'grid') {
    const cols = Number(view.args[0] ?? 2);
    return (
      <div className="layout-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(720 / cols)}px), 1fr))`, gap }}>
        {view.children.map((c) => (
          <ViewRenderer key={c.id} view={c} />
        ))}
      </div>
    );
  }
  if (view.kind === 'component' || view.kind.startsWith('kind:')) {
    return (
      <div className="layout-component" data-component={view.componentName}>
        <Eyebrow>
          {view.kind.startsWith('kind:') ? 'kind' : 'component'} · {view.componentName}
          {view.describeText ? ` · ${view.describeText}` : ''}
        </Eyebrow>
        {view.children.map((c) => (
          <ViewRenderer key={c.id} view={c} />
        ))}
      </div>
    );
  }
  void ctx;
  return (
    <div className={view.kind === 'row' ? 'layout-row' : 'layout-stack'} style={{ gap }}>
      {view.children.map((c) => (
        <ViewRenderer key={c.id} view={c} />
      ))}
    </div>
  );
};

export const ViewRenderer: React.FC<ViewProps> = ({ view }) => {
  const C = VIEWS[view.kind] ?? (['row', 'stack', 'grid', 'split', 'component'].includes(view.kind) || view.kind.startsWith('kind:') ? Layout : null);
  if (!C) return <PanelError error={new Error(`no renderer for view kind "${view.kind}"`)} />;
  return (
    <Boundary kind={view.kind}>
      <C view={view} />
    </Boundary>
  );
};
