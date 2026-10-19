// A lab program's board as a dock view (guide §33): the board context every panel reads through, the renderer that
// maps a view's kind to its panel, the layouts (row, stack, grid, split), and the sheet: title, the board's own
// parameters, the panels, and a title block saying where the data came from.
import React, { Component, createContext, useContext, useMemo } from "react";
import { wb } from "../wb.js";
import { useLab, cls } from "../common.jsx";
import { ParamBar } from "./params.jsx";
import { labs } from "./state.js";
import { inline } from "../doc.js";
import { materialize, makeDollar, resolveValue, isLive, isEnt } from "./api.js";
import { TableView, StatView, RunListView, ManifestView, ManifestDiffView, TextView, NoteView, MathView, SourceView, HypothesisCardView, ControlView } from "./panels.jsx";
import { ChartView, TimelineView, MirrorView } from "./charts.jsx";
import { GalleryView, DetectionsView } from "./media.jsx";
import { KernelCardView, RouteView, LedgerView, StepperView, BatchView } from "./inspect.jsx";

const Ctx = createContext(null);

/** The board a panel is in: { lab, boardId, reg, state, resolve, resolveLazy, setRef }. */
export function useBoard() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBoard outside a board");
  return c;
}

/** Evaluate a panel's inputs against the board's state; an error renders in the panel instead of breaking the board. */
export function useResolved(fn, deps) {
  const ctx = useBoard();
  return useMemo(() => { try { return { value: fn(ctx.resolve) }; } catch (error) { return { error }; } }, [ctx.resolve, ...deps]);
}

/** Inline text as the notes render it: **bold**, `code`, $math$, links. */
export const Rich = ({ text, as: As = "span", className }) => <As className={className} dangerouslySetInnerHTML={{ __html: inline(String(text ?? "")) }} />;

export function PanelError({ error }) {
  return <p className="lab-err" role="alert">{String(error?.message ?? error)}</p>;
}

/** A panel: what kind of view it is, what it reads, a stamp saying what kind of reading it is, its title, its own
 * controls (`actions`), its content and a footer line. */
export function Panel({ kind, input, title, stamp, actions, footer, children, flush }) {
  return (
    <section className={cls("lpanel", flush && "flush")} aria-label={title ? `${kind}: ${title}` : kind}>
      {kind || title || input ? (
        <header>
          {title ? <h3><Rich text={title} /></h3> : null}
          <span className="lp-kind">{kind}{input ? <> · <span className="mono">{input}</span></> : null}</span>
          {stamp || actions ? <span className="lp-right">{stamp ? <span className="stamp">{stamp}</span> : null}{actions}</span> : null}
        </header>
      ) : null}
      <div className="lp-body">{children}</div>
      {footer ? <p className="lp-foot">{footer}</p> : null}
    </section>
  );
}

class Boundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <Panel kind={this.props.kind}><PanelError error={this.state.error} /></Panel> : this.props.children; }
}

const VIEWS = {
  table: TableView, chart: ChartView, timeline: TimelineView, stat: StatView, manifest: ManifestView, manifestDiff: ManifestDiffView,
  hypothesisCard: HypothesisCardView, note: NoteView, math: MathView, text: TextView, source: SourceView, runList: RunListView, control: ControlView,
  mirror: MirrorView, gallery: GalleryView, detections: DetectionsView, kernelCard: KernelCardView, route: RouteView, ledger: LedgerView, stepper: StepperView, batchView: BatchView,
};
const LAYOUTS = new Set(["row", "stack", "grid", "split"]);

const isComponent = (kind) => kind === "component" || kind.startsWith("kind:");

function Layout({ view }) {
  // a program's own component (or a kind's view): its children under a line naming it
  if (isComponent(view.kind)) {
    return (
      <div className="lab-comp" data-component={view.componentName}>
        <span className="note">{view.kind === "component" ? "component" : "kind"} · {view.componentName}{view.describeText ? ` · ${view.describeText}` : ""}</span>
        {view.children.map((c) => <ViewRenderer key={c.id} view={c} />)}
      </div>
    );
  }
  if (view.kind === "split") {
    const sizes = view.args[0] ?? [1, 1];
    // each side grows by its share and wraps below the other when the tile is narrower than two of them
    return <div className="lab-split">{["left", "right"].map((k, i) => <div key={k} style={{ flex: `${sizes[i] ?? 1} 1 320px` }}>{view.slots[k] ? <ViewRenderer view={view.slots[k]} /> : null}</div>)}</div>;
  }
  const grid = view.kind === "grid" ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(720 / Number(view.args[0] ?? 2))}px), 1fr))` } : null;
  return <div className={cls(view.kind === "row" ? "lab-row" : view.kind === "grid" ? "lab-grid" : "lab-stack")} style={grid}>{view.children.map((c) => <ViewRenderer key={c.id} view={c} />)}</div>;
}

export function ViewRenderer({ view }) {
  const C = VIEWS[view.kind] ?? (LAYOUTS.has(view.kind) || isComponent(view.kind) ? Layout : null);
  if (!C) return <Panel kind={view.kind}><PanelError error={`This workbench has no panel for "${view.kind}" yet.`} /></Panel>;
  return <Boundary kind={view.kind}><C view={view} /></Boundary>;
}

/** Where a board's runs came from, as the title block says it. */
function dataOrigin(reg, experiments) {
  const runs = experiments.flatMap((e) => reg.source.runs(`${e}/*/*`));
  if (!runs.length) return experiments.length ? "no runs imported" : "illustrative data";
  const measured = runs.filter((r) => r.synthetic === false);
  if (!measured.length) return "synthetic data";
  const hosts = [...new Set(measured.map((r) => String(r.host)))].join(", ");
  return measured.length === runs.length ? `measured on ${hosts}` : `measured on ${hosts} + synthetic`;
}

/** The dock view for board `id` of the open lab program. */
export function BoardView({ id }) {
  useLab("lab");
  const lab = labs.current;
  const reg = lab?.reg, board = reg?.boards.get(id), summary = lab?.ir?.boards.find((b) => b.id === id);
  const state = lab?.state;
  const selected = lab?.selected ?? null;
  const ctx = useMemo(() => {
    if (!reg) return null;
    const setRef = (ref, value) => labs.setRef(ref, value);
    // a view's .on(event, fn) handlers run against the board's state; a selected entity is followed everywhere
    const fire = (view, event, payload) => {
      const ent = payload.entity ?? payload.row;
      if (event === "select" && isEnt(ent)) labs.select(ent.ref);
      for (const h of view.handlers.filter((x) => x.event === event)) {
        try { h.fn(makeDollar(reg, state, { set: setRef, event: payload })); }
        catch (e) { wb.toast(`handler .on('${event}'): ${e.message}`); }
      }
    };
    return { lab, boardId: id, reg, state, selected, setRef, fire, resolve: (x) => materialize(reg, x, state), resolveLazy: (x) => resolveValue(x, makeDollar(reg, state)) };
  }, [reg, state, id, selected]);
  if (!lab) return <div className="page"><p className="empty padded">No lab program is open. Open one from the Lab view.</p></div>;
  if (!board || !ctx) return <div className="page"><p className="empty padded">{lab.title} has no board “{id}”.</p></div>;
  const $ = makeDollar(reg, state);
  const text = (x) => { try { return x === undefined ? undefined : String(isLive(x) ? x.fn($) : x); } catch (e) { return `⚠ ${e.message}`; } };
  const experiments = summary?.experiments ?? [];
  const runs = experiments.flatMap((e) => reg.source.runs(`${e}/*/*`));
  const invalid = runs.filter((r) => !r.validity?.ok).length;
  const index = lab.ir.boards.findIndex((b) => b.id === id);
  return (
    <Ctx.Provider value={ctx}>
      <div className="page col lab-board">
        <div className="scroll">
          <header className="detail-h lab-head">
            <h2><Rich text={text(board.titleText) ?? board.id} /></h2>
            {board.titleText !== undefined && board.subtitleText !== undefined ? <Rich as="p" className="sub" text={text(board.subtitleText)} /> : null}
          </header>
          {summary ? <ParamBar lab={lab} board={summary} /> : null}
          <div className="lab-panels">{board.views.map((v) => <ViewRenderer key={v.id} view={v} />)}</div>
        </div>
        <div className="titleblock">
          <div><label>lab program</label><b>{lab.title}</b></div>
          <div><label>board</label><b>B-{String(index + 1).padStart(2, "0")} of {lab.ir.boards.length} · {board.id}</b></div>
          <div><label>runs</label><b>{runs.length}{invalid ? ` · ${invalid} invalid` : ""} · {experiments.length} experiment{experiments.length === 1 ? "" : "s"}</b></div>
          <div><label>data</label><b>{dataOrigin(reg, experiments)}</b></div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

