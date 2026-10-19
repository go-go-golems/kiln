// The Lab's layout: a tree of tiles. A split lays its children out in a row or a column, with
// fractional sizes. A tile holds an ordered list of views, one of them active. Each view appears at
// most once; a view that appears nowhere is closed and can be opened from any tile's + menu.
// Every operation here is pure: it takes a tree and returns a new one.

export const IDE_VIEWS = ["notes", "code", "agent", "reference"];
export const SYS_VIEWS = ["ir", "graph", "trace", "kernels", "perf", "knobs", "tune", "evidence", "hypotheses", "devices", "jobs", "events"];
export const ALL_VIEWS = [...IDE_VIEWS, ...SYS_VIEWS];

const nid = (p) => p + Math.random().toString(36).slice(2, 8);
export const tile = (views = [], active) => ({ t: "tile", id: nid("t"), views: [...views], active: active ?? views[0] ?? null });
export const split = (dir, kids, sizes) => ({ t: "split", id: nid("s"), dir, kids, sizes: sizes || kids.map(() => 1 / kids.length) });

export const LAYOUTS = [
  { id: "default", label: "Code beside the compiler", make: () => split("row", [tile(IDE_VIEWS), split("col", [tile(["ir", "graph", "trace", "kernels"]), tile(["perf", "knobs", "tune", "evidence", "hypotheses", "devices", "jobs", "events"])], [0.56, 0.44])], [0.4, 0.6]) },
  { id: "compiler", label: "IRs, passes and knobs", make: () => split("row", [tile(IDE_VIEWS), tile(["ir", "graph", "kernels"]), split("col", [tile(["trace", "events"]), tile(["knobs", "perf", "tune", "evidence", "hypotheses", "devices", "jobs"])], [0.5, 0.5])], [0.32, 0.38, 0.3]) },
  { id: "perf", label: "Measure and tune", make: () => split("row", [tile(IDE_VIEWS), split("col", [tile(["perf", "evidence", "hypotheses", "tune", "knobs"]), tile(["kernels", "devices", "jobs", "ir", "graph", "trace", "events"])], [0.55, 0.45])], [0.36, 0.64]) },
  { id: "one", label: "Everything in one tile", make: () => tile([...SYS_VIEWS, ...IDE_VIEWS], "ir") },
];
export const defaultLayout = () => LAYOUTS[0].make();

const clone = (n) => JSON.parse(JSON.stringify(n));

export function walk(n, fn, parent = null) {
  if (!n) return;
  fn(n, parent);
  if (n.t === "split") for (const k of n.kids) walk(k, fn, n);
}
export function tiles(root) { const out = []; walk(root, (n) => { if (n.t === "tile") out.push(n); }); return out; }
export function findNode(root, id) { let hit = null; walk(root, (n) => { if (n.id === id) hit = n; }); return hit; }
export function parentOf(root, id) { let hit = null; walk(root, (n, p) => { if (n.id === id) hit = p; }); return hit; }
export function tileOf(root, view) { return tiles(root).find((t) => t.views.includes(view)) || null; }
export function openViews(root) { return tiles(root).flatMap((t) => t.views); }

// Clean a tree: drop unknown or repeated views, dead tiles and empty splits; merge a split into its
// parent when they run the same way; keep sizes summing to 1. A tree with nothing left becomes one empty tile.
export function normalize(root) {
  const seen = new Set();
  const fix = (n) => {
    if (!n || typeof n !== "object") return null;
    if (n.t === "tile") {
      if (n.dead) return null;
      const views = [];
      for (const v of Array.isArray(n.views) ? n.views : []) if (ALL_VIEWS.includes(v) && !seen.has(v)) { seen.add(v); views.push(v); }
      return { t: "tile", id: n.id || nid("t"), views, active: views.includes(n.active) ? n.active : views[0] ?? null };
    }
    if (n.t === "split") {
      const dir = n.dir === "col" ? "col" : "row";
      const kids = [], sizes = [];
      (n.kids || []).forEach((k, i) => {
        const f = fix(k);
        if (!f) return;
        const s = Number(n.sizes?.[i]) > 0 ? Number(n.sizes[i]) : 1 / (n.kids.length || 1);
        if (f.t === "split" && f.dir === dir) f.kids.forEach((g, j) => { kids.push(g); sizes.push(s * f.sizes[j]); });
        else { kids.push(f); sizes.push(s); }
      });
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      const sum = sizes.reduce((a, b) => a + b, 0) || 1;
      return { t: "split", id: n.id || nid("s"), dir, kids, sizes: sizes.map((s) => s / sum) };
    }
    return null;
  };
  return fix(root) || tile([]);
}

// Take a view out of the tile that holds it. A tile left empty by this disappears.
function takeOut(r, view, keep = null) {
  const src = tileOf(r, view);
  if (!src) return null;
  const i = src.views.indexOf(view);
  src.views.splice(i, 1);
  if (src.active === view) src.active = src.views[Math.min(i, src.views.length - 1)] ?? null;
  if (!src.views.length && src.id !== keep) src.dead = true;
  return src;
}

// Put a view into a tile's tab strip at `index` (the end when omitted) and make it active.
export function moveToTab(root, view, tileId, index = null) {
  const r = clone(root);
  const dst = findNode(r, tileId);
  if (!dst || dst.t !== "tile") return root;
  const src = tileOf(r, view);
  if (src && src.id === dst.id) {
    const from = dst.views.indexOf(view);
    dst.views.splice(from, 1);
    const to = index == null ? dst.views.length : index > from ? index - 1 : index;
    dst.views.splice(Math.max(0, Math.min(to, dst.views.length)), 0, view);
  } else {
    takeOut(r, view, dst.id);
    const at = index == null ? dst.views.length : Math.max(0, Math.min(index, dst.views.length));
    dst.views.splice(at, 0, view);
  }
  dst.active = view;
  return normalize(r);
}

// Put a view in a new tile on one side of an existing tile. side: left, right, top, bottom.
export function moveToSide(root, view, tileId, side) {
  const r0 = findNode(root, tileId);
  if (!r0 || r0.t !== "tile") return root;
  const from = tileOf(root, view);
  if (from && from.id === tileId && from.views.length === 1) return root;   // a tile cannot be split by its only view
  const r = clone(root);
  takeOut(r, view, tileId);
  return normalize(insertBeside(r, tileId, side, tile([view])));
}

// A new, empty tile beside an existing one; it shows a view picker until something is put in it.
export function splitTile(root, tileId, side) {
  return normalize(insertBeside(clone(root), tileId, side, tile([])));
}

function insertBeside(r, tileId, side, fresh) {
  const dir = side === "left" || side === "right" ? "row" : "col";
  const before = side === "left" || side === "top";
  const dst = findNode(r, tileId);
  const p = parentOf(r, tileId);
  if (p && p.dir === dir) {
    const i = p.kids.indexOf(dst);
    const half = p.sizes[i] / 2;
    p.kids.splice(before ? i : i + 1, 0, fresh);
    p.sizes.splice(i, 1, half, half);
    return r;
  }
  const s = split(dir, before ? [fresh, dst] : [dst, fresh], [0.5, 0.5]);
  if (!p) return s;
  p.kids[p.kids.indexOf(dst)] = s;
  return r;
}

export function closeView(root, view) {
  const r = clone(root);
  takeOut(r, view);
  return normalize(r);
}
export function closeTile(root, tileId) {
  const r = clone(root);
  const t = findNode(r, tileId);
  if (t) t.dead = true;
  return normalize(r);
}
export function activate(root, tileId, view) {
  const r = clone(root);
  const t = findNode(r, tileId);
  if (t && t.views.includes(view)) t.active = view;
  return r;
}
export function resize(root, splitId, sizes) {
  const r = clone(root);
  const s = findNode(r, splitId);
  if (s && s.t === "split" && sizes.length === s.kids.length) s.sizes = sizes;
  return r;
}

// Show a view: activate it where it is, or open it in the tile where it most likely belongs.
export function reveal(root, view, prefTileId = null) {
  const at = tileOf(root, view);
  if (at) return at.active === view ? root : activate(root, at.id, view);
  const all = tiles(root);
  const kin = IDE_VIEWS.includes(view) ? IDE_VIEWS : SYS_VIEWS;
  const home = all.find((t) => t.views.some((v) => kin.includes(v)))
    || all.find((t) => !t.views.length)
    || all.find((t) => t.id === prefTileId) || all[0];
  const i = home.active ? home.views.indexOf(home.active) + 1 : home.views.length;
  return moveToTab(root, view, home.id, i);
}

// Views in reading order, for narrow screens that show one strip of tabs.
export function flatViews(root) {
  const open = openViews(root);
  return [...open, ...ALL_VIEWS.filter((v) => !open.includes(v))];
}
