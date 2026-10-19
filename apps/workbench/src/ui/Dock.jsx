import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { wb as lab } from "./wb.js";
import { useLab, Btn, Tabs, cls } from "./common.jsx";
import { VIEWS } from "./views.jsx";
import * as D from "./dock.js";

// The tiled workspace. Drag a tab onto another tile's tabs to group it there, or onto a tile's edge to
// split that tile. Gutters between tiles resize them; ⤢ or ⌘\ shows one tile alone.

const EDGE = 0.25;          // the outer quarter of a tile's body splits it; the middle adds a tab
const NARROW = "(max-width: 640px)";

export function Dock() {
  useLab("layout");
  const narrow = useMedia(NARROW);
  lab.narrow = narrow;
  if (narrow) return <PhoneDock />;
  const max = lab.maxTile && D.findNode(lab.layout, lab.maxTile);
  return (
    <div className={cls("dock", max && "maxed")}>
      <DockNode node={max || lab.layout} />
      <DragLayer />
    </div>
  );
}

function useMedia(q) {
  const get = () => typeof matchMedia === "function" && matchMedia(q).matches;
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q), on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

function DockNode({ node }) {
  return node.t === "split" ? <Split node={node} /> : <Tile node={node} />;
}

function Split({ node }) {
  const box = useRef(null);
  return (
    <div ref={box} className={cls("dsplit", node.dir)}>
      {node.kids.map((kid, i) => (
        <React.Fragment key={kid.id}>
          {i > 0 ? <Gutter node={node} i={i} box={box} /> : null}
          <div className="dcell" style={{ flex: `${node.sizes[i]} 1 0px` }}><DockNode node={kid} /></div>
        </React.Fragment>
      ))}
    </div>
  );
}

function Gutter({ node, i, box }) {
  const row = node.dir === "row";
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = box.current.getBoundingClientRect();
    const total = (row ? r.width : r.height) - (node.kids.length - 1) * 5;
    const p0 = row ? e.clientX : e.clientY;
    const a0 = node.sizes[i - 1], b0 = node.sizes[i];
    const min = Math.min((a0 + b0) / 2, 140 / total);
    document.body.classList.add(row ? "resizing-x" : "resizing-y");
    const mv = (ev) => {
      const d = ((row ? ev.clientX : ev.clientY) - p0) / total;
      let a = a0 + d, b = b0 - d;
      if (a < min) { b -= min - a; a = min; }
      if (b < min) { a -= min - b; b = min; }
      lab.setLayout(D.resize(lab.layout, node.id, node.sizes.map((s, j) => (j === i - 1 ? a : j === i ? b : s))), { save: false });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-x", "resizing-y");
      lab.setLayout(lab.layout);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const even = () => { const a = node.sizes[i - 1], b = node.sizes[i]; lab.setLayout(D.resize(lab.layout, node.id, node.sizes.map((s, j) => (j === i - 1 || j === i ? (a + b) / 2 : s)))); };
  const key = (e) => {
    const step = (e.shiftKey ? 0.1 : 0.02) * ((row ? e.key === "ArrowRight" : e.key === "ArrowDown") ? 1 : (row ? e.key === "ArrowLeft" : e.key === "ArrowUp") ? -1 : 0);
    if (!step) return;
    e.preventDefault();
    const a = Math.max(0.05, node.sizes[i - 1] + step), b = Math.max(0.05, node.sizes[i] - step);
    lab.setLayout(D.resize(lab.layout, node.id, node.sizes.map((s, j) => (j === i - 1 ? a : j === i ? b : s))));
  };
  return <div className={cls("gutter", node.dir)} onPointerDown={down} onDoubleClick={even} onKeyDown={key} tabIndex={0}
    role="separator" aria-orientation={row ? "vertical" : "horizontal"} aria-label="Resize tiles" title="Drag to resize · double-click to make even" />;
}

// a view's body only re-renders when the view itself asks to, not when the layout around it changes
const ViewBody = React.memo(function ViewBody({ id }) { return VIEWS[id].el(); });

function Tile({ node }) {
  const v = node.active;
  return (
    <section className="tile" data-tile={node.id} onPointerDownCapture={() => { lab.focusTile = node.id; }} aria-label={v ? VIEWS[v].title : "Empty tile"}>
      <Strip node={node} />
      <div className="tilebody" data-body={node.id}>
        {v ? <div className={cls("tabbody", VIEWS[v].col && "col")} key={v}><ViewBody id={v} /></div> : <Picker node={node} />}
      </div>
    </section>
  );
}

function Strip({ node }) {
  useLab("compile", "measure", "tune", "store", "agent", "device");
  const [menu, setMenu] = useState(null);
  const maxed = lab.maxTile === node.id;
  const elsewhere = D.ALL_VIEWS.filter((v) => !node.views.includes(v));
  const open = D.openViews(lab.layout);
  return (
    <div className="dstrip" data-strip={node.id} onDoubleClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains("dtabs")) lab.toggleMax(node.id); }}>
      <div className="dtabs" role="tablist">
        {node.views.map((v) => <DTab key={v} node={node} v={v} />)}
      </div>
      <button type="button" className="tabact plus" title="Show another view in this tile" aria-label="Add a view to this tile" aria-haspopup="menu" onClick={(e) => setMenu({ kind: "add", el: e.currentTarget })}>+</button>
      <span className="sp" />
      <button type="button" className="tabact" title={maxed ? "Show all tiles (⌘\\)" : "Show this tile alone (⌘\\)"} aria-label={maxed ? "Restore tiles" : "Maximize tile"} onClick={() => lab.toggleMax(node.id)}>{maxed ? "⤡" : "⤢"}</button>
      <button type="button" className="tabact" title="Split or close this tile" aria-label="Tile menu" aria-haspopup="menu" onClick={(e) => setMenu({ kind: "tile", el: e.currentTarget })}>⋯</button>
      {menu?.kind === "add" ? (
        <FloatMenu anchor={menu.el} onClose={() => setMenu(null)}>
          <div className="grp">Show here</div>
          {elsewhere.map((v) => (
            <button key={v} type="button" onClick={() => { setMenu(null); lab.dropView(v, { kind: "tab", tile: node.id }); }}>
              <span className="t">{VIEWS[v].title}</span><small>{VIEWS[v].about}{open.includes(v) ? " · moves it here" : ""}</small>
            </button>
          ))}
          {!elsewhere.length ? <p className="note padded">Every view is already in this tile.</p> : null}
        </FloatMenu>
      ) : null}
      {menu?.kind === "tile" ? (
        <FloatMenu anchor={menu.el} onClose={() => setMenu(null)} right>
          <button type="button" onClick={() => { setMenu(null); lab.splitTile(node.id, "right"); }}>Split right<small>a new empty tile beside this one</small></button>
          <button type="button" onClick={() => { setMenu(null); lab.splitTile(node.id, "bottom"); }}>Split down<small>a new empty tile below this one</small></button>
          <button type="button" onClick={() => { setMenu(null); lab.toggleMax(node.id); }}>{maxed ? "Show all tiles" : "Show this tile alone"}<small>⌘\</small></button>
          <hr />
          <button type="button" onClick={() => { setMenu(null); lab.closeTile(node.id); }}>Close this tile<small>its views close; reopen them from any + menu</small></button>
        </FloatMenu>
      ) : null}
    </div>
  );
}

function DTab({ node, v }) {
  const V = VIEWS[v];
  const b = V.badge?.();
  const on = node.active === v;
  return (
    <div className={cls("dtab", on && "on")} data-tab={v} onPointerDown={(e) => startDrag(e, v, node.id)}>
      <button type="button" role="tab" aria-selected={on} className="lbl" onClick={() => lab.activateTab(node.id, v)} title={`${V.title}: ${V.about}. Drag to move.`}>
        {V.title}{b ? <span className={cls("count", b[1] && "bad")}>{b[0]}</span> : null}
      </button>
      <button type="button" className="x" aria-label={`Close ${V.title}`} title={`Close ${V.title}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => lab.closeView(v)}>×</button>
    </div>
  );
}

function Picker({ node }) {
  useLab("layout");
  const open = D.openViews(lab.layout);
  return (
    <div className="picker">
      <p className="lead">An empty tile. Pick a view for it, or drag a tab here.</p>
      <div className="pgrid">
        {D.ALL_VIEWS.map((v) => (
          <button key={v} type="button" onClick={() => lab.dropView(v, { kind: "tab", tile: node.id })}>
            <b>{VIEWS[v].title}</b><small>{VIEWS[v].about}</small>{open.includes(v) ? <em>moves it here</em> : null}
          </button>
        ))}
      </div>
      <Btn sm onClick={() => lab.closeTile(node.id)}>Close this tile</Btn>
    </div>
  );
}

// a menu drawn above everything, anchored to a button, so a narrow tile never clips it
function FloatMenu({ anchor, onClose, right, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = ref.current?.offsetWidth || 260, h = ref.current?.offsetHeight || 200;
    let left = right ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top });
  }, [anchor]);
  useEffect(() => {
    const off = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, []);
  return createPortal(
    <div ref={ref} className="menu floating" role="menu" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}>{children}</div>,
    document.body,
  );
}

// ---------- dragging a tab ----------
function startDrag(e, view, fromTile) {
  if (e.button !== 0 || e.target.closest(".x")) return;
  const x0 = e.clientX, y0 = e.clientY;
  let on = false;
  const move = (ev) => {
    if (!on) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      on = true;
      document.body.classList.add("dragging-view");
      lab.drag = { view, from: fromTile, x: ev.clientX, y: ev.clientY, target: null };
    }
    lab.drag.x = ev.clientX; lab.drag.y = ev.clientY;
    lab.drag.target = hitTest(ev.clientX, ev.clientY, view, fromTile);
    lab.bump("drag");
  };
  const end = (commit) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", esc, true);
    document.body.classList.remove("dragging-view");
    const t = lab.drag?.target;
    lab.drag = null;
    lab.bump("drag");
    if (on && commit && t) lab.dropView(view, t);
    if (on) {
      // the click that ends a drag should not also activate a tab
      const stop = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      window.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    }
  };
  const up = () => end(true);
  const cancel = () => end(false);
  const esc = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); end(false); } };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", esc, true);
}

function hitTest(x, y, view, fromTile) {
  const els = document.elementsFromPoint(x, y);
  const strip = els.find((el) => el.dataset?.strip);
  if (strip) {
    const tileId = strip.dataset.strip;
    const tabs = [...strip.querySelectorAll("[data-tab]")];
    let index = tabs.length;
    for (let i = 0; i < tabs.length; i++) { const r = tabs[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { index = i; break; } }
    const at = tabs[index] ? tabs[index].getBoundingClientRect() : tabs.length ? tabs[tabs.length - 1].getBoundingClientRect() : strip.getBoundingClientRect();
    const sr = strip.getBoundingClientRect();
    const mx = tabs[index] ? at.left : tabs.length ? at.right : sr.left + 4;
    return { kind: "tab", tile: tileId, index, rect: { left: mx - 1, top: sr.top + 4, width: 3, height: sr.height - 8 }, marker: true };
  }
  const body = els.find((el) => el.dataset?.body);
  if (!body) return null;
  const tileId = body.dataset.body;
  const r = body.getBoundingClientRect();
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
  const side = Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
  const T = D.findNode(lab.layout, tileId);
  const alone = T && T.views.length === 1 && T.views[0] === view;
  if (d[side] < EDGE && !alone) {
    const half = { left: { left: r.left, top: r.top, width: r.width / 2, height: r.height }, right: { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height },
      top: { left: r.left, top: r.top, width: r.width, height: r.height / 2 }, bottom: { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 } }[side];
    return { kind: "side", tile: tileId, side, rect: half };
  }
  if (tileId === fromTile) return null;          // the middle of its own tile: nothing to do
  return { kind: "tab", tile: tileId, index: null, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
}

function DragLayer() {
  useLab("drag");
  const g = lab.drag;
  if (!g) return null;
  const t = g.target;
  const label = !t ? "" : t.kind === "side" ? `new tile ${({ left: "on the left", right: "on the right", top: "above", bottom: "below" })[t.side]}` : t.marker ? "as a tab here" : "as a tab in this tile";
  return createPortal(
    <>
      {t ? <div className={cls("drop-hint", t.marker && "marker")} style={{ left: t.rect.left, top: t.rect.top, width: t.rect.width, height: t.rect.height }}>{t.marker ? null : <span>{label}</span>}</div> : null}
      <div className="drag-ghost" style={{ left: g.x + 12, top: g.y + 10 }}>{VIEWS[g.view].title}{t?.marker ? <small> as a tab here</small> : null}</div>
    </>,
    document.body,
  );
}

// ---------- narrow screens: one strip with every view ----------
function PhoneDock() {
  useLab("layout", "compile", "measure", "tune", "agent");
  const views = D.flatViews(lab.layout);
  const v = views.includes(lab.phoneView) ? lab.phoneView : "ir";
  return (
    <div className="pane dock-phone">
      <Tabs value={v} onChange={(x) => { lab.noteActive(x); lab.bump("layout"); }}
        items={views.map((id) => { const b = VIEWS[id].badge?.(); return [id, VIEWS[id].title, b?.[0] ?? null, b?.[1]]; })} />
      <div className={cls("tabbody", VIEWS[v].col && "col")} key={v}><ViewBody id={v} /></div>
    </div>
  );
}
