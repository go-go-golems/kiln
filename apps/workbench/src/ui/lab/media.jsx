// A dataset's images and the boxes each run predicted on them (guide §33), ported from Perf Lab's GalleryView,
// DetectionsView and DetectionOverlay. In Kiln's monochrome, layers differ by weight and dash, never by hue: ground
// truth dashed, the baseline thick, the candidate thin, any further run dotted; every stroke has a dark halo so it
// reads on any photo, and red marks only the selected box. The overlay is decorative; the table beside it carries
// every box in text and is how a keyboard reaches them.
import React, { useMemo, useRef, useState } from "react";
import { Seg, cls } from "../common.jsx";
import { Panel, PanelError, useBoard, useResolved } from "./board.jsx";
import { isEnt, isQuery } from "./api.js";

// ----------------------------------------------------------------------------- what is known about one image

/** A dataset handle (dataset('…')), a hash or a ref prefix → the manifest hash. */
const datasetSha = (x) => (x && typeof x === "object" && "sha256" in x ? String(x.sha256) : String(x ?? ""));
const ARM_ORDER = ["baseline", "candidate"];
const ARM_STYLE = { baseline: { weight: 4 }, candidate: { weight: 1.5 } };
const armRank = (a) => (ARM_ORDER.includes(a) ? ARM_ORDER.indexOf(a) : ARM_ORDER.length);

/** An image's annotations and each prediction run's record of it. */
function evidenceFor(source, ds, imageId, runs) {
  const image = source.entities("image", ds).find((i) => i.imageId === imageId);
  const truth = source.entities("annotation", ds).filter((a) => a.image === imageId && !a.iscrowd);
  const arms = runs ? source.runs(runs).sort((a, b) => armRank(String(a.arm)) - armRank(String(b.arm))).map((r) => ({
    arm: String(r.arm), experiment: String(r.experiment), run: r.ref,
    recorded: source.entities("instant", r.ref).some((i) => i.type === "predictions.image" && i.image === imageId),
    detections: source.entities("detection", r.ref).filter((d) => d.image === imageId),
  })) : [];
  return { image, truth, arms };
}

const fmtDet = (d) => `${String(d.label)} ${Number(d.confidence).toFixed(3)}`;

function layersFor(ev, { diff = false } = {}) {
  const layers = [{ key: "truth", label: "ground truth", dashed: true, weight: 1.5, boxes: ev.truth.map((a) => ({ ref: a.ref, bbox: a.bbox, text: String(a.label) })) }];
  // runs from different experiments may share an arm name (the candidate on two hosts): name them by experiment then
  const seen = new Set(), shared = new Set(ev.arms.filter((a) => (seen.has(a.arm) ? true : (seen.add(a.arm), false))).map((a) => a.arm));
  const used = new Set();
  for (const a of ev.arms) {
    const style = !used.has(a.arm) && ARM_STYLE[a.arm] ? ARM_STYLE[a.arm] : { weight: 2, dotted: true };
    used.add(a.arm);
    const dets = diff ? a.detections.filter((d) => d.status !== "exact") : a.detections;
    layers.push({ key: a.run, label: shared.has(a.arm) ? `${a.experiment} · ${a.arm}` : a.arm, ...style, boxes: dets.map((d) => ({ ref: d.ref, bbox: d.bbox, text: fmtDet(d) })) });
  }
  return layers;
}

/** One word for an image across arms: what a reviewer needs before opening it. */
function verdictOf(ev) {
  if (!ev.arms.length) return "no runs";
  if (!ev.arms.every((a) => a.recorded)) return "digest only";
  return ev.arms.every((a) => a.detections.every((d) => d.status === "exact")) ? "exact" : "differs";
}

// ----------------------------------------------------------------------------- the overlay

const rectOf = (b, w, h) => ({ x: b[0] * w, y: b[1] * h, width: Math.max(0, (b[2] - b[0]) * w), height: Math.max(0, (b[3] - b[1]) * h) });
const dashOf = (l, compact) => (l.dashed ? (compact ? "3 2" : "6 4") : l.dotted ? (compact ? "1 2" : "2 3") : undefined);

/**
 * An image and its boxes in the image's own pixel coordinates (viewBox = width × height), so a normalized box is
 * placed by one multiplication. All halos are drawn before any stroke, so a thin candidate over an identical thick
 * baseline stays visible as a band inside it.
 */
function DetectionOverlay({ width, height, src, alt, layers, focus, compact, frame }) {
  const font = Math.max(width, height) / 42;
  const focused = layers.flatMap((l) => l.boxes.map((b) => ({ l, b }))).find((x) => x.b.ref === focus);
  const ratio = width / height;
  const inner = (
    <div className={cls("dov", compact && "compact")} style={{ aspectRatio: `${width} / ${height}`, width: frame && ratio < frame ? `${(ratio / frame) * 100}%` : "100%" }}>
      {src ? <img className="dov-img" src={src} alt={alt} loading="lazy" decoding="async" /> : <div className="dov-missing hatched">{compact ? "not imported" : "image not in the media store: import it with lab:import"}</div>}
      <svg className="dov-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <g>{layers.map((l) => l.boxes.map((b) => <rect key={`${l.key}:${b.ref}`} {...rectOf(b.bbox, width, height)} className="dov-halo" strokeWidth={l.weight + 2} vectorEffect="non-scaling-stroke" />))}</g>
        {layers.map((l) => <g key={l.key}>{l.boxes.map((b) => <rect key={b.ref} {...rectOf(b.bbox, width, height)} fill="none" className="dov-box" strokeWidth={l.weight} strokeDasharray={dashOf(l, compact)} vectorEffect="non-scaling-stroke" />)}</g>)}
        {focused ? (
          <g className="dov-focus">
            <rect {...rectOf(focused.b.bbox, width, height)} fill="none" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            {focused.b.text ? <text x={focused.b.bbox[0] * width + font * 0.3} y={Math.max(font, focused.b.bbox[1] * height - font * 0.35)} fontSize={font}>{focused.l.label}: {focused.b.text}</text> : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
  return frame ? <div className="dov-frame" style={{ aspectRatio: String(frame) }}>{inner}</div> : inner;
}

/** The legend that names each layer's encoding in words; a key toggles its layer. */
function OverlayLegend({ layers, hidden, onToggle }) {
  return (
    <ul className="lc-legend dov-legend" aria-label="Layers">
      {layers.map((l) => (
        <li key={l.key}>
          <button type="button" className="dov-key" aria-pressed={!hidden.has(l.key)} onClick={() => onToggle(l.key)}>
            <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" className="dov-halo" strokeWidth={l.weight + 2} /><line x1="1" y1="5" x2="21" y2="5" className="dov-box" strokeWidth={l.weight} strokeDasharray={l.dashed ? "4 3" : l.dotted ? "2 2" : undefined} /></svg>
            <span>{l.label} · {l.boxes.length} · {l.dashed ? "dashed" : l.dotted ? "dotted" : l.weight > 2 ? "thick" : "thin"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------- gallery

/**
 * A dataset's images as a grid. Each tile shows the ground truth (dashed) and the last arm's boxes, a caption and a
 * one-word verdict. Arrow keys move through the grid, Enter selects; the board decides what a selection does.
 */
export function GalleryView({ view }) {
  const ctx = useBoard();
  const grid = useRef(null);
  const [filter, setFilter] = useState(["all", "recorded", "differs", "negatives"].includes(String(view.p("filter"))) ? view.p("filter") : "all");
  const input = view.args[0];
  const r = useResolved((res) => {
    const rows = res(input);
    return {
      images: (Array.isArray(rows) ? rows : []).filter((x) => isEnt(x) && x.kind === "image"),
      runs: view.p("runs") ? String(res(view.p("runs"))) : undefined,
      selected: view.p("selected") === undefined ? undefined : Number(res(view.p("selected"))),
      title: res(view.p("title")),
    };
  }, [view]);
  const items = useMemo(() => (r.value ? r.value.images.map((im) => { const ev = evidenceFor(ctx.reg.source, String(im.dataset), Number(im.imageId), r.value.runs); return { im, ev, verdict: verdictOf(ev) }; }) : []), [r.value, ctx.reg.source]);
  if (r.error) return <Panel kind="gallery"><PanelError error={r.error} /></Panel>;
  const shown = items.filter(({ im, ev, verdict }) => (filter === "all" ? true : filter === "recorded" ? ev.arms.length > 0 && ev.arms.every((a) => a.recorded) : filter === "differs" ? verdict === "differs" : Boolean(im.negative)));
  const recorded = items.filter((x) => x.verdict === "exact" || x.verdict === "differs").length, differs = items.filter((x) => x.verdict === "differs").length;
  const present = items.filter((x) => x.im.present).length;
  const move = (from, key) => {
    const tiles = [...(grid.current?.querySelectorAll(".gal-tile") ?? [])];
    if (!tiles.length) return false;
    const cols = Math.max(1, tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length);
    const to = { ArrowRight: from + 1, ArrowLeft: from - 1, ArrowDown: from + cols, ArrowUp: from - cols, Home: 0, End: tiles.length - 1 }[key];
    if (to === undefined) return false;
    tiles[Math.max(0, Math.min(tiles.length - 1, to))]?.focus();
    return true;
  };
  return (
    <Panel kind="gallery" input={isQuery(input) ? input.describe() : undefined} title={r.value?.title}
      actions={<Seg sm label="Images shown" value={filter} onChange={setFilter} items={[["all", `All ${items.length}`], ["recorded", `Predicted ${recorded}`], ["differs", `Differs ${differs}`], ["negatives", "Negatives"]]} />}
      footer={`${shown.length} of ${items.length} images · ${present} in the media store · dashed: ground truth · ${items[0]?.ev.arms.at(-1)?.arm ?? "no run"}: ${items[0]?.ev.arms.length > 1 ? "thin" : "solid"}${r.value?.runs ? "" : " · no prediction runs named"}`}>
      {!shown.length ? <div className="lab-empty"><b>No images match</b><span>{items.length ? "Choose another filter." : "The dataset is not on the Kiln server, or this query selects none of its images."}</span></div> : (
        <div className="gal" ref={grid} role="listbox" aria-label="Images" aria-orientation="horizontal">
          {shown.map(({ im, ev, verdict }, i) => {
            const layers = layersFor(ev).filter((l, k, all) => l.key === "truth" || k === all.length - 1);
            const selected = r.value?.selected === im.imageId;
            const det = ev.arms.map((a) => `${a.arm[0]} ${a.recorded ? a.detections.length : "–"}`).join(" · ");
            return (
              <button key={im.ref} type="button" role="option" aria-selected={selected} className={cls("gal-tile", selected && "sel")}
                tabIndex={selected || (r.value?.selected === undefined && i === 0) ? 0 : -1}
                onClick={() => ctx.fire(view, "select", { entity: im })} onKeyDown={(e) => { if (move(i, e.key)) e.preventDefault(); }}>
                <DetectionOverlay compact frame={4 / 3} width={Number(im.width)} height={Number(im.height)} src={im.mediaUrl ? String(im.mediaUrl) : null} alt="" layers={layers} />
                <span className="gal-cap mono"><b>{String(im.imageId)}</b><span className="dim">{String(im.strata)}</span></span>
                <span className="gal-meta mono"><span>{String(im.annotations)} GT{det ? ` · ${det}` : ""}</span><span className={cls("stamp", verdict === "differs" && "bad", verdict === "exact" && "solid")}>{verdict}</span></span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------------------- one image

const STATUS = { exact: "", "within-tolerance": "solid", changed: "", added: "bad", dropped: "bad" };

/** One image with its ground truth and every prediction run's boxes, and the table of every box. */
export function DetectionsView({ view }) {
  const ctx = useBoard();
  const [focus, setFocus] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [mode, setMode] = useState(view.p("diff") ? "diff" : "all");
  const r = useResolved((res) => ({ ds: datasetSha(res(view.args[0])), imageId: Number(res(view.args[1])), runs: view.p("runs") ? String(res(view.p("runs"))) : undefined, title: res(view.p("title")) }), [view]);
  const ev = useMemo(() => (r.value ? evidenceFor(ctx.reg.source, r.value.ds, r.value.imageId, r.value.runs) : null), [r.value, ctx.reg.source]);
  if (r.error) return <Panel kind="detections"><PanelError error={r.error} /></Panel>;
  if (!ev) return null;
  const input = `${r.value.ds.slice(0, 8)} · image ${r.value.imageId}${r.value.runs ? ` · ${r.value.runs}` : ""}`;
  if (!ev.image) return <Panel kind="detections" input={input}><div className="lab-empty"><b>No image {r.value.imageId} in this dataset</b><span>The dataset is not on the Kiln server, or the id is not part of it.</span></div></Panel>;
  const im = ev.image, W = Number(im.width), H = Number(im.height);
  const all = layersFor(ev, { diff: mode === "diff" }), layers = all.filter((l) => !hidden.has(l.key));
  const rows = [
    ...(hidden.has("truth") ? [] : ev.truth.map((ent) => ({ layer: "ground truth", ent }))),
    ...ev.arms.filter((a) => !hidden.has(a.run)).flatMap((a) => (mode === "diff" ? a.detections.filter((d) => d.status !== "exact") : a.detections).map((ent) => ({ layer: all.find((l) => l.key === a.run)?.label ?? a.arm, ent }))),
  ];
  const px = (b, i) => Math.round((b?.[i] ?? 0) * (i % 2 ? H : W) * 10) / 10;
  const unrecorded = ev.arms.filter((a) => !a.recorded);
  const toggle = (k) => setHidden((h) => new Set(h.has(k) ? [...h].filter((x) => x !== k) : [...h, k]));
  return (
    <Panel kind="detections" input={input} title={r.value.title ?? `${String(im.fileName)} · ${W} × ${H}`}
      actions={<Seg sm label="Boxes shown" value={mode} onChange={setMode} items={[["all", "All"], ["diff", "Differences"]]} />}
      footer={<>
        {String(im.strata)} · {im.license ? <a href={String(im.licenseUrl ?? "#")} target="_blank" rel="noreferrer">{String(im.license)}</a> : "licence unknown"}
        {im.pageUrl ? <> · <a href={String(im.pageUrl)} target="_blank" rel="noreferrer">source</a></> : null}
        {unrecorded.length ? ` · ${unrecorded.map((a) => a.arm).join(", ")}: no prediction record for this image (the report keeps an output digest only)` : ""}
      </>}>
      <div className="detv">
        <figure className="detv-fig">
          <DetectionOverlay width={W} height={H} src={im.mediaUrl ? String(im.mediaUrl) : null} alt={`Image ${String(im.imageId)}, ${W} by ${H} pixels`} layers={layers} focus={focus ?? (rows.some((x) => x.ent.ref === ctx.selected) ? ctx.selected : null)} />
          <figcaption><OverlayLegend layers={all} hidden={hidden} onToggle={toggle} /></figcaption>
        </figure>
        <div className="detv-table lab-table">
          {!rows.length ? <div className="lab-empty"><b>{mode === "diff" ? "No differences" : "No boxes"}</b><span>{mode === "diff" ? "Every detection of every arm is identical for this image." : "No layer has a box for this image."}</span></div> : (
            <table className="rt">
              <thead><tr><th>layer</th><th>label</th><th className="num">conf.</th><th className="num">x1, y1 – x2, y2 (px)</th><th>vs. other arm</th><th>truth</th></tr></thead>
              <tbody>
                {rows.map(({ layer, ent }) => {
                  const isDet = ent.kind === "detection";
                  return (
                    <tr key={ent.ref} tabIndex={0} aria-selected={ctx.selected === ent.ref} className={cls("clickable", ctx.selected === ent.ref && "sel")}
                      onFocus={() => setFocus(ent.ref)} onBlur={() => setFocus(null)} onMouseEnter={() => setFocus(ent.ref)} onMouseLeave={() => setFocus(null)}
                      onClick={() => ctx.fire(view, "select", { entity: ent })}
                      onKeyDown={(e) => {
                        const row = e.currentTarget;
                        if (e.key === "ArrowDown") { e.preventDefault(); row.nextElementSibling?.focus(); }
                        if (e.key === "ArrowUp") { e.preventDefault(); row.previousElementSibling?.focus(); }
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.fire(view, "select", { entity: ent }); }
                      }}>
                      <td>{layer}</td><td>{String(ent.label)}</td>
                      <td className="num">{isDet ? Number(ent.confidence).toFixed(4) : "—"}</td>
                      <td className="num mono">{px(ent.bbox, 0)}, {px(ent.bbox, 1)} – {px(ent.bbox, 2)}, {px(ent.bbox, 3)}</td>
                      <td>{isDet ? <span className={cls("stamp", STATUS[String(ent.status)])}>{String(ent.status)}</span> : ""}</td>
                      <td className="mono">{isDet ? (ent.gt != null ? `#${String(ent.gt)} · IoU ${Number(ent.iou).toFixed(2)}` : ent.truthKnown ? "false positive" : "—") : `#${String(ent.id)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Panel>
  );
}
