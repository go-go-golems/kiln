import React, { useEffect, useMemo, useRef, useState } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Seg, cls } from "./common.jsx";
import { renderDoc } from "./doc.js";
import { followLabLink } from "./links.js";
import { saveText } from "./Kernels.jsx";

// The project's notes: a tutorial in Markdown with math, rendered next to the code. Links can drive the
// workbench (set a slider, pin a knob, measure, switch device), so a lesson is something you do.
export function NotesView() {
  useLab("notes", "preset", "platform");
  const [mode, setMode] = useState("read");
  const box = useRef(null);
  const { html, toc } = useMemo(() => renderDoc(wb.notes), [wb.notes, wb.version("katex")]);
  useEffect(() => { if (box.current) box.current.scrollTop = 0; }, [wb.preset?.id]);
  const onClick = (e) => {
    const a = e.target.closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("lab:")) { e.preventDefault(); followLabLink(href); }
    else if (href.startsWith("#")) { e.preventDefault(); box.current?.querySelector("#" + CSS.escape(href.slice(1)))?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  };
  const p = wb.preset;
  const empty = !wb.notes.trim();
  return (
    <div className="notes">
      <div className="toolbar">
        <span className="ntitle"><span className="pcode">{p?.id}</span> <b>{p?.title}</b></span>
        <span className="sp" />
        <Seg sm label="Notes mode" value={mode} onChange={setMode} items={[["read", "Read"], ["edit", "Edit"]]} />
        <Btn sm onClick={() => { wb.agentDraft = empty ? `Write a tutorial for this project in its notes (notes.set): the idea, the maths, what to measure, and exercises.` : `About the notes for ${p?.id}: `; wb.bump("agentDraft"); wb.showView("agent"); }}>{empty ? "Ask the agent to write them" : "Ask about this"}</Btn>
      </div>
      {mode === "edit" ? (
        <div className="notes-edit">
          <textarea value={wb.notes} onChange={(e) => wb.setNotes(e.target.value)} spellCheck={false} aria-label="Notes (Markdown)" placeholder={"# Title\n\nMarkdown with $math$, $$display math$$, tables, > **Try** call-outs,\nand links that drive the workbench: [measure](lab:measure), [degree 64](lab:param?name=degree&value=64)"} />
          <div className="ed-foot"><span><b>{wb.notes.split("\n").length}</b> lines of Markdown</span><span className="sp" /><span>{wb.notes === wb.savedNotes ? "saved" : "edited — Save keeps it with the project"}</span><button type="button" className="link" onClick={() => saveText(`${p?.id || "notes"}.md`, wb.notes)}>download .md</button></div>
        </div>
      ) : (
        <div className="scroll" ref={box} onClick={onClick}>
          {empty ? (
            <div className="doc"><p className="empty">This project has no notes yet. Switch to Edit to write some — Markdown with $math$, tables and call-outs, and links that drive the workbench — or ask the agent to write a tutorial.</p></div>
          ) : (
            <article className="doc">
              {toc.length > 2 ? <nav className="toc" aria-label="Contents">{toc.map((t) => <a key={t.id} href={"#" + t.id} className="anchor">{t.title}</a>)}</nav> : null}
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </article>
          )}
        </div>
      )}
    </div>
  );
}
