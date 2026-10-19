import React, { useEffect, useRef, useState } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Seg, Menu, cls } from "./common.jsx";
import { highlight, highlightC } from "./highlight.js";
import { md } from "./md.js";
import { clip } from "@kiln/kiln/core/util.js";
import {
  agent, TIER_LABEL, setSetting, send, stop, retry, steps, canRevert, revertFrom, approve,
  convs, newConv, openConv, deleteConv, conversationMarkdown, SUGGESTIONS,
} from "../agent/agent.js";
import { saveText, copyText } from "./Kernels.jsx";
import { followLabLink } from "./links.js";

const secs = (ms) => (ms / 1000).toFixed(1) + " s";

export function AgentPanel() {
  useLab("agent", "platform", "agentDraft", "preset");
  const [tab, setTab] = useState("chat");
  useEffect(() => { if (wb.agentDraft != null) setTab("chat"); }, [wb.version("agentDraft")]);
  const conv = agent.conv ?? newConv();
  const exportConv = () => saveText((conv.title.replace(/[^\w]+/g, "-").toLowerCase() || "conversation") + ".md", conversationMarkdown(conv));
  return (
    <div className="agent-panel">
      <div className="agent-head">
        <span className="t">{conv.title}</span>
        <Btn sm onClick={() => { newConv(); setTab("chat"); }} disabled={agent.busy}>New chat</Btn>
        <button type="button" className="ibtn" title="Save this conversation as Markdown" aria-label="Save conversation" onClick={exportConv} disabled={!conv.messages.length}>⤓</button>
      </div>
      <div className="subtabs" role="tablist">
        {[["chat", "Agent"], ["history", "History"]].map(([key, l]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{l}</button>
        ))}
      </div>
      {tab === "history" ? <History onOpen={() => setTab("chat")} /> : <Chat conv={conv} />}
    </div>
  );
}

function Chat({ conv }) {
  useLab("agent", "platform", "agentDraft");
  const [draft, setDraft] = useState("");
  const logRef = useRef(null), ta = useRef(null);
  const s = agent.settings, busy = agent.busy, sample = wb.sample;
  useEffect(() => {
    if (wb.agentDraft == null) return;
    setDraft(wb.agentDraft); wb.agentDraft = null;
    requestAnimationFrame(() => { const t = ta.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } });
  }, [wb.version("agentDraft")]);
  useEffect(() => { const el = logRef.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight; });
  const submit = () => {
    if (busy) return stop();
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    send(t);
  };
  const tries = (wb.preset?.tries || []).slice(0, 2);
  const sugg = [...tries, ...SUGGESTIONS].slice(0, 6);
  const onLink = (e) => {
    const a = e.target.closest?.("a.lablink");
    if (!a) return;
    e.preventDefault();
    followLabLink(a.getAttribute("href"));
  };
  return (
    <>
      <div className="agent-set">
        <span className="ctl-l">Model</span>
        <Seg sm label="Model" items={[["quick", "Fast"], ["default", "Balanced"], ["complex", "Deep"]]} value={s.tier} onChange={(v) => setSetting("tier", v)} />
        <span className="ctl-l">Thinking</span>
        <div className={cls("seg sm", s.tier === "quick" && "dis")} role="group" aria-label="Thinking">
          {["low", "medium", "high"].map((v) => <button key={v} type="button" aria-pressed={s.effort === v} className={s.effort === v ? "on" : ""} disabled={s.tier === "quick"} onClick={() => setSetting("effort", v)}>{v === "medium" ? "Med" : v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
        <span className="ctl-l">Run</span>
        <Seg sm label="Run mode" items={[["auto", "Auto", "Steps run at once; you can revert any of them"], ["ask", "Ask", "Every step waits for you"], ["readonly", "Read-only", "The agent can look, compile in isolation and measure without recording, but change nothing"]]} value={s.mode} onChange={(v) => setSetting("mode", v)} />
      </div>
      {wb.platformReady && !sample ? (
        <div className="agent-off"><b>Claude is not connected here.</b> The agent calls Claude from this page, which works when the workbench is open in Claude. The editor, compiler, simulator, devices and tuner all work without it.</div>
      ) : null}
      <div className="agent-log" ref={logRef} onClick={onLink}>
        {conv.messages.length ? conv.messages.map((m, i) => (m.role === "user" ? <UserMsg key={i} m={m} /> : <AssistantMsg key={i} m={m} i={i} />)) : (
          <div className="agent-empty">
            <p>The agent works on the compiler with one tool: JavaScript that runs here, against the editor, every IR, the pass trace, the forks, the kernels, the devices and the tuner. It writes passes, dialects and whole pipelines, compiles and checks them, and measures what they produce. In <b>Auto</b> every step can be reverted; in <b>Ask</b> each one waits for you.</p>
            <div className="sugg">{sugg.map((x) => <button key={x} type="button" onClick={() => { setDraft(x); ta.current?.focus(); }}>{x}</button>)}</div>
          </div>
        )}
      </div>
      <div className="composer">
        <textarea ref={ta} value={draft} rows={3} placeholder={sample || !wb.platformReady ? "Ask about this compile, or describe a pass, an IR or a program to build…" : "Open the workbench in Claude to talk to the agent"} aria-label="Message the agent"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <div className="row">
          <span className="meta">{TIER_LABEL[s.tier]}{s.tier !== "quick" ? ` · ${s.effort} thinking` : ""} · {s.mode === "readonly" ? "read-only" : s.mode} · Enter sends</span>
          <Btn primary={!busy} danger={busy} onClick={submit} disabled={!busy && !draft.trim()}>{busy ? "Stop" : "Send"}</Btn>
        </div>
      </div>
    </>
  );
}

function UserMsg({ m }) {
  return (
    <div className="msg user">
      <span className="who">you{m.ctx ? " · + context" : ""}</span>
      <div className="body">{m.text}</div>
      <div className="acts"><button type="button" className="link" onClick={() => copyText(m.text, "the message")}>copy</button></div>
    </div>
  );
}

function interleave(text, parts, msg) {
  const out = [];
  let pos = 0;
  [...parts].sort((a, b) => a.at - b.at).forEach((p, i) => {
    const seg = text.slice(pos, Math.max(pos, p.at));
    if (seg.trim()) out.push(<div key={"t" + i} className="md" dangerouslySetInnerHTML={{ __html: md(seg) }} />);
    pos = Math.max(pos, p.at);
    out.push(p.type === "tool" ? <ToolCard key={"p" + i} part={p} msg={msg} /> : <Part key={"p" + i} p={p} />);
  });
  const rest = text.slice(pos);
  if (rest.trim()) out.push(<div key="tend" className="md" dangerouslySetInnerHTML={{ __html: md(rest) }} />);
  return out;
}

function AssistantMsg({ m, i }) {
  const [rmenu, setRmenu] = useState(false);
  const st = steps(m);
  let body;
  if (m.pending || !st.length) body = interleave(m.text, m.parts || [], m);
  else {
    const cut = Math.max(...st.map((p) => p.at));
    const final = m.text.slice(cut);
    if (!final.trim()) body = interleave(m.text, m.parts, m);
    else {
      const failed = st.filter((p) => p.status === "err").length;
      body = (
        <>
          <details className="fold"><summary>Worked through {st.length} step{st.length === 1 ? "" : "s"} · {secs(m.usage?.ms ?? 0)}{failed ? ` · ${failed} failed` : ""}</summary>{interleave(m.text.slice(0, cut), st, m)}</details>
          {(m.parts || []).filter((p) => p.type !== "tool").map((p, j) => <Part key={"v" + j} p={p} />)}
          <div className="md" dangerouslySetInnerHTML={{ __html: md(final) }} />
        </>
      );
    }
  }
  const firstUndo = st.find((p) => canRevert(p) && !p.reverted);
  return (
    <div className={cls("msg agent", m.error && !m.text && "error")}>
      <span className="who">agent{m.pending ? " · working" : ""}</span>
      {m.pending && !m.text && !(m.parts || []).length ? <div className="thinking">thinking…</div> : null}
      {body}
      {m.error ? <div className="res bad">{m.error}</div> : null}
      {m.truncated ? <div className="res bad">The answer was cut short. Ask for less at a time.</div> : null}
      {m.pending ? null : (
        <div className="acts">
          <button type="button" className="link" onClick={() => copyText(m.text, "the answer")}>copy</button>
          <span className="rel">
            <button type="button" className="link" onClick={() => setRmenu(!rmenu)} aria-haspopup="menu" aria-expanded={rmenu}>retry…</button>
            <Menu open={rmenu} onClose={() => setRmenu(false)} className="retry">
              <div className="mh">Answer again with</div>
              {[["Same settings", null], ["Fast", { tier: "quick" }], ["Balanced", { tier: "default" }], ["Deep", { tier: "complex", effort: "high" }], ["Read-only", { mode: "readonly" }]].map(([l, o]) => (
                <button key={l} type="button" disabled={agent.busy} onClick={() => { setRmenu(false); retry(i, o); }}>{l}</button>
              ))}
            </Menu>
          </span>
          {firstUndo ? <button type="button" className="link strong" onClick={() => revertFrom(m, firstUndo)}>undo this answer</button> : null}
          <span className="usage">{TIER_LABEL[m.tierApplied ?? m.tier] ?? m.tier}{m.tier !== "quick" ? ` · ${m.effort}` : ""} · {m.mode} · {st.length} eval{st.length === 1 ? "" : "s"}{m.usage ? ` · ${secs(m.usage.ms)}` : ""}</span>
        </div>
      )}
    </div>
  );
}

function ToolCard({ part, msg }) {
  useLab("agent");
  const first = (part.code.split("\n").find((l) => l.trim() && !l.trim().startsWith("//")) ?? "").trim();
  const [open, setOpen] = useState(part.status === "ask");
  const ref = useRef(null);
  useEffect(() => { if (part.status === "ask") { setOpen(true); requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "nearest" })); } }, [part.status]);
  const idx = steps(msg).indexOf(part);
  return (
    <details ref={ref} className={cls("tool", part.status, part.reverted && "reverted")} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="dot" />
        <span className="nm">eval</span>
        <span className="first" dangerouslySetInnerHTML={{ __html: highlight(first.slice(0, 120)) }} />
        <span className="ms">{part.status === "run" ? "running" : part.status === "ask" ? "waiting for you" : part.ms != null ? part.ms + " ms" : ""}{part.reverted ? " · reverted" : ""}</span>
      </summary>
      <div className="tb">
        <pre className="src hl" dangerouslySetInnerHTML={{ __html: highlight(part.code) }} />
        {part.status === "ask" ? (
          <div className="row">
            <span className="ctl-l">Run this step?</span>
            <Btn sm primary onClick={() => approve(part, "run")}>Run</Btn>
            <Btn sm onClick={() => approve(part, "all")}>Run all in this answer</Btn>
            <Btn sm danger onClick={() => approve(part, "deny")}>Decline</Btn>
          </div>
        ) : null}
        {part.result != null ? <pre className={cls("res", part.status === "err" && "bad")}>{part.result}</pre> : null}
        {part.logs ? <pre className="res logs">{part.logs}</pre> : null}
        {canRevert(part) && !part.reverted && part.status !== "run" && part.status !== "ask" && !msg.pending ? (
          <div className="row"><button type="button" className="link" onClick={() => revertFrom(msg, part)}>revert to before step {idx + 1}</button></div>
        ) : null}
      </div>
    </details>
  );
}

function Part({ p }) {
  switch (p.type) {
    case "table": {
      const cols = [...new Set(p.rows.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : ["value"])))].slice(0, 10);
      return (
        <div className="part">
          {p.title ? <div className="ptitle">{p.title}{p.total > p.rows.length ? ` · first ${p.rows.length} of ${p.total}` : ""}</div> : null}
          <div className="ptable"><table className="rt"><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{p.rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{fmtCell(r && typeof r === "object" ? r[c] : r)}</td>)}</tr>)}</tbody></table></div>
        </div>
      );
    }
    case "code": {
      const c = /^(cuda|c|wgsl|cu)$/i.test(p.lang || "") || /__global__|@compute/.test(p.code);
      return (
        <div className="part">
          <div className="ptitle">{p.title}<span className="sp" /><button type="button" className="link" onClick={() => copyText(p.code, p.title || "the code")}>copy</button></div>
          <pre className="src hl snip" dangerouslySetInnerHTML={{ __html: c ? highlightC(clip(p.code, 12000)) : highlight(clip(p.code, 12000)) }} />
        </div>
      );
    }
    case "proposal":
      return (
        <div className="part prop">
          <div className="ptitle">{p.title}{p.ok ? "" : " · does not compile"}</div>
          {p.errors?.length ? <div className="res bad">{p.errors.join("\n")}</div> : null}
          <pre className="src hl snip" dangerouslySetInnerHTML={{ __html: highlight(clip(p.code, 4000)) }} />
          <div className="row">
            <Btn sm onClick={() => { wb.setScript(p.code); wb.showView("code"); }}>Open in editor</Btn>
            <Btn sm primary onClick={async () => { wb.script = p.code; wb.bump("code"); if (wb.compile()) await wb.measure(); }}>Open and measure</Btn>
            <Btn sm onClick={() => copyText(p.code, "the script")}>Copy</Btn>
          </div>
        </div>
      );
    default: return null;
  }
}
const fmtCell = (v) => (v == null ? "" : typeof v === "object" ? clip(JSON.stringify(v), 120) : String(v));

function History({ onOpen }) {
  useLab("convs", "agent");
  const [q, setQ] = useState("");
  const [armed, setArmed] = useState(null);
  const list = convs().filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="hist">
      <p className="note">Conversations are kept in this browser only.</p>
      <div className="toolbar"><input className="filter" placeholder="Filter conversations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter conversations" /><Btn sm onClick={() => { newConv(); onOpen(); }}>New chat</Btn></div>
      <div className="scroll">
        {list.length ? list.map((c) => (
          <div key={c.id} className={cls("hrow", c.id === agent.conv?.id && "on")} onClick={() => { openConv(c.id); onOpen(); }}>
            <span className="hmain"><b>{c.title}</b><span className="sub">{c.messages.length} messages · {c.messages.reduce((a, m) => a + steps(m).length, 0)} evals · {new Date(c.updatedAt).toLocaleString()}</span></span>
            <button type="button" className={cls("link", armed === c.id && "bad")} onClick={(e) => { e.stopPropagation(); if (armed === c.id) { deleteConv(c.id); setArmed(null); } else setArmed(c.id); }}>{armed === c.id ? "delete?" : "delete"}</button>
          </div>
        )) : <p className="empty padded">No saved conversations yet. They appear here after the first answer.</p>}
      </div>
    </div>
  );
}
