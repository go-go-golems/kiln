import React, { useEffect, useRef, useState } from "react";
import { wb, GROUP_ORDER } from "./wb.js";
import { useLab, Btn, Pill, Menu, cls } from "./common.jsx";
import { Dock } from "./Dock.jsx";
import { LAYOUTS } from "./dock.js";
import { fmtUs } from "@kiln/kiln/core/util.js";

export function App() {
  useLab("ready", "ui");
  useEffect(() => {
    const key = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "\\") { e.preventDefault(); wb.toggleMax(); }
      else if (mod && (e.key === "b" || e.key === "B")) { e.preventDefault(); wb.compile(); }
      else if (mod && e.key === "Enter") { e.preventDefault(); wb.measure(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (wb.ui.theme === "auto") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", wb.ui.theme);
  }, [wb.ui.theme]);
  if (!wb.ready) return <div id="app"><Header /><div className="boot-screen"><p>{wb.error ? "Could not start: " + wb.error : "Compiling the first project…"}</p></div></div>;
  return (
    <div id="app">
      <Header />
      <div id="work"><Dock /></div>
      <Toasts />
    </div>
  );
}

function Toasts() {
  useLab("toast");
  return <div className="toasts" aria-live="polite">{wb.toasts.map((t) => <div key={t.id} className={cls("toast", t.tone)}>{t.text}</div>)}</div>;
}

function Header() {
  useLab("preset", "ui", "compile", "measure", "device", "tune", "code", "diags", "notes");
  const [menu, setMenu] = useState(false);
  const [save, setSave] = useState(false);
  const p = wb.preset;
  const s = wb.summary();
  const fileRef = useRef(null);
  const groups = GROUP_ORDER.map((g) => [g, wb.presets.filter((x) => x.group === g || (g === "Mine" && x.mine && !GROUP_ORDER.includes(x.group)))]).filter(([, l]) => l.length);
  const download = async () => {
    setSave(false);
    const name = (p?.id || "project") + "-" + (p?.title || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".js";
    const dl = await window.claude?.use?.("downloads").catch(() => null);
    if (dl) { try { await dl.save({ filename: name, data: wb.script }); wb.toast("Saved " + name); } catch { wb.toast("The download was declined", "bad"); } return; }
    try { await navigator.clipboard.writeText(wb.script); wb.toast("Copied the script (downloads are not available here)"); } catch { wb.toast("Downloads are not available here", "bad"); }
  };
  const importFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const id = wb.newPresetFromText(await f.text());
    setMenu(false);
    wb.load(id);
  };
  const dev = wb.device;
  return (
    <header className="bar">
      <div className="brand">Kiln Workbench <i>source → passes → kernels → device</i></div>
      <div className="proj">
        <button type="button" className="projbtn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
          <span className="pcode">{p?.id}</span><span className="ptitle">{p?.title || "…"}</span><span className="caret">▾</span>
        </button>
        <Menu open={menu} onClose={() => setMenu(false)} className="presets">
          {groups.map(([g, list]) => (
            <React.Fragment key={g}>
              <div className="grp">{g}</div>
              {list.map((x) => (
                <button key={x.id} type="button" className={x.id === p?.id ? "on" : ""} onClick={() => { setMenu(false); wb.load(x.id); }}>
                  <span className="code">{x.id}</span><span className="t">{x.title}</span><small>{x.about}</small>
                </button>
              ))}
            </React.Fragment>
          ))}
          <hr />
          <button type="button" onClick={() => { setMenu(false); wb.showView("agent"); wb.agentDraft = "Make a new project: "; wb.bump("agentDraft"); }}><b>New project with the agent…</b><small>describe a program, a pass or an IR; the agent writes, compiles and measures it</small></button>
          <button type="button" onClick={() => { setMenu(false); wb.savePreset({ asNew: true }); }}>Duplicate {p?.id} into My presets<small>start from the current script and notes</small></button>
          <button type="button" onClick={() => fileRef.current?.click()}>Import from file…<small>a .js project script</small></button>
          <input ref={fileRef} type="file" accept=".js,.txt,text/javascript" hidden onChange={importFile} />
        </Menu>
      </div>
      <div className="defbtns">
        <Btn onClick={() => wb.compile()} title="Compile the script through the pipeline (⌘B)">Compile</Btn>
        <Btn onClick={() => wb.measure()} disabled={!wb.prog || !!wb.measuring} title="Run every kernel on the selected device and check it (⌘↵)"><span className="long">{wb.measuring ? `Measuring ${wb.measuring.done}/${wb.measuring.total}…` : "Measure ▸"}</span><span className="short">Run</span></Btn>
      </div>
      <button type="button" className="devpill" onClick={() => wb.showView("devices")} title="Device: click to change">
        <span className={cls("dot", dev.kind === "sim" ? "sim" : dev.status === "ready" ? "live" : "off")} />
        <span className="dn">{dev.label}</span>
      </button>
      <span className="sp" />
      {wb.run ? <Pill big={wb.prog ? s.kernels : wb.run.graph.size} small={wb.prog ? `kernel${s.kernels === 1 ? "" : "s"} · ${wb.compileMs.toFixed(0)} ms compile` : `nodes · ${wb.compileMs.toFixed(0)} ms`} onClick={() => wb.showView("kernels")} title="Kernels" /> : null}
      {s.total != null ? <Pill big={fmtUs(s.total)} small={s.stale ? "last measure (stale)" : "measured"} onClick={() => wb.showView("perf")} title="Performance" /> : null}
      {wb.tuning?.running ? <Pill big={wb.tuning.history.length + "/" + wb.tuning.budget} small="tuning" busy onClick={() => wb.showView("tune")} /> : null}
      {s.errors ? <Pill big={s.errors} small="errors" bad onClick={() => wb.showView("code")} /> : null}
      {s.failing ? <Pill big={s.failing} small="checks failing" bad onClick={() => wb.showView(wb.e2e?.ok === false ? "code" : "perf")} /> : null}
      <div className="proj">
        <Btn primary onClick={() => setSave(!save)}><span className="long">Save ▾</span><span className="short">Save</span></Btn>
        <Menu open={save} onClose={() => setSave(false)} right>
          <button type="button" onClick={() => { setSave(false); wb.savePreset(); }}>{p?.mine ? `Save ${p.id}` : "Save to My presets"}<small>kept in this browser</small></button>
          <button type="button" onClick={() => { setSave(false); wb.savePreset({ asNew: true }); }}>Save as a new preset</button>
          <button type="button" onClick={download}>Download .js</button>
          {wb.notes ? <button type="button" onClick={async () => { setSave(false); const dl = await window.claude?.use?.("downloads").catch(() => null); const name = (p?.id || "project") + "-notes.md"; if (dl) { try { await dl.save({ filename: name, data: wb.notes }); wb.toast("Saved " + name); } catch { wb.toast("The download was declined", "bad"); } } else { try { await navigator.clipboard.writeText(wb.notes); wb.toast("Copied the notes"); } catch { wb.toast("Downloads are not available here", "bad"); } } }}>Download notes .md</button> : null}
          {p?.mine ? <button type="button" onClick={() => { setSave(false); wb.deletePreset(p.id); wb.load("W-05"); }}>Delete {p.id}</button> : null}
        </Menu>
      </div>
      <LayoutMenu />
      <button type="button" className="ibtn" title="Theme" aria-label="Switch theme" onClick={() => wb.setUI({ theme: wb.ui.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark") : wb.ui.theme === "dark" ? "light" : "dark" })}>◐</button>
    </header>
  );
}

function LayoutMenu() {
  useLab("layout");
  const [open, setOpen] = useState(false);
  return (
    <div className="proj laymenu">
      <button type="button" className="ibtn" title="Layout" aria-label="Layout" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>▦</button>
      <Menu open={open} onClose={() => setOpen(false)} right className="layouts">
        <div className="grp">Layouts</div>
        {LAYOUTS.map((L) => <button key={L.id} type="button" onClick={() => { setOpen(false); wb.useLayout(L.id); }}>{L.label}</button>)}
        <hr />
        <button type="button" onClick={() => { setOpen(false); wb.toggleMax(); }}>{wb.maxTile ? "Show all tiles" : "Show the current tile alone"}<small>⌘\</small></button>
        <p className="note padded">Drag a tab onto another tile's tabs to group them, or onto a tile's edge to split it. Your layout is kept in this browser.</p>
      </Menu>
    </div>
  );
}
