import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/atoms/Button';
import { Chip } from '@/components/atoms/Chip';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { IconButton } from '@/components/atoms/IconButton';
import { Segmented } from '@/components/atoms/Segmented';
import { SelectBox } from '@/components/atoms/SelectBox';
import { CodeBlock } from '@/components/molecules/CodeBlock';
import { DataBlock } from '@/components/molecules/DataBlock';
import { RichText } from '@/components/molecules/RichText';
import { askAgent, clearTranscript, loadTranscript, repliesFor, stopTurn } from '@/features/agent/runtime';
import { ASSISTANT } from '@/features/agent/builtins';
import { selectLabParams } from '@/features/params/paramsSlice';
import { selectAgentLab, setMode, setModel, setView, type TokenUsage, type Turn } from '@/features/agent/agentSlice';
import type { IR } from '@/lang/ir';
import { JobCard } from '../PlanTab';
import { TranscriptLibrary } from '../TranscriptLibrary';
import './AgentRail.css';

const TurnView: React.FC<{ turn: Turn; current: string }> = ({ turn, current }) => {
  const job = useAppSelector((s) => (turn.jobId ? s.jobs.list.find((j) => j.id === turn.jobId) : undefined));
  if (turn.role === 'user')
    return (
      <div className="turn turn--user">
        {turn.board !== current ? <span className="turn__board">on {turn.board} · </span> : null}
        {turn.text}
      </div>
    );
  return (
    <div className="turn turn--agent">
      <Eyebrow>
        {ASSISTANT.name}
        {turn.board !== current ? ` · on ${turn.board}` : ''}
        {turn.mode === 'live' ? ` · ${turn.model ?? 'live'}${turn.step && turn.step > 1 ? ` · step ${turn.step}` : ''}` : turn.mode === 'scripted' ? ' · scripted' : ''}
      </Eyebrow>
      <p className={`turn__text${turn.error ? ' turn__error' : ''}`}>
        {turn.streaming ? turn.text : <RichText text={turn.text} />}
        {turn.streaming ? <span className="turn__caret" aria-hidden>▍</span> : null}
      </p>
      {turn.code ? <CodeBlock className="turn__code" code={turn.code} lang="js" label={turn.skipped ? 'js · not run (no executions left)' : 'js · eval'} maxHeight={280} /> : null}
      {job ? <JobCard job={job} /> : null}
      {turn.status === 'running' ? (
        <div className="turn__running">
          <Chip tone="sig" variant="tint">
            running
          </Chip>
          <Button size="sm" variant="ghost" icon="stop" onClick={() => stopTurn(turn.id)}>
            Stop
          </Button>
        </div>
      ) : null}
      {turn.usage ? <Usage usage={turn.usage} /> : null}
      {turn.result ? (
        <div className={`turn__result${turn.result.ok ? '' : ' is-error'}`}>
          <div className="turn__status mono">
            {turn.result.ok ? `OK · ${turn.result.ms} ms` : `ROLLED BACK · ${turn.result.ms} ms`}
          </div>
          {turn.result.logs.length ? <CodeBlock code={turn.result.logs.join('\n')} lang="text" label="log" maxHeight={160} /> : null}
          {turn.result.ok ? (
            <DataBlock text={turn.result.value ?? 'undefined'} label="result" maxHeight={320} />
          ) : (
            <CodeBlock code={turn.result.error ?? 'unknown error'} lang="text" label="error · rolled back" maxHeight={160} />
          )}
        </div>
      ) : null}
    </div>
  );
};

const fmtTokens = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Token accounting for one model call, as the provider reported it, plus the prompt estimate. */
const Usage: React.FC<{ usage: TokenUsage }> = ({ usage }) => (
  <div className="turn__usage mono" title="tokens reported by the provider; the gateway's input count omits the system prompt, so the prompt size is also estimated (characters ÷ 4)">
    {fmtTokens(usage.input)} in · {fmtTokens(usage.output)} out{usage.reasoning !== null && usage.reasoning !== undefined ? ` · ${fmtTokens(usage.reasoning)} reasoning` : ''}
    {usage.estPrompt ? ` · prompt ≈ ${fmtTokens(usage.estPrompt)} (est.)` : ''}
  </div>
);

/**
 * The workbench's one assistant. It always works on the board in view (`self`); its suggestions are the
 * scripted prompts that are real actions on that board. The input stays visible at the bottom of the rail.
 */
export const AgentRail: React.FC<{ labId: string; boardId: string; ir: IR }> = ({ labId, boardId, ir }) => {
  const dispatch = useAppDispatch();
  const st = useAppSelector((s) => selectAgentLab(s, labId));
  const mode = useAppSelector((s) => s.agent.mode);
  const view = useAppSelector((s) => s.agent.view);
  const online = useAppSelector((s) => s.server.status === 'online');
  const model = useAppSelector((s) => s.server.health?.assistant);
  const models = useAppSelector((s) => s.server.models);
  const chosen = useAppSelector((s) => s.agent.model ?? s.server.defaultModel ?? '');
  const liveReady = online && Boolean(model?.available);
  const [chosenSpec, chosenThinking = ''] = chosen.split(':');
  const chosenInfo = models.find((m) => m.spec === chosenSpec);
  useEffect(() => {
    if (online) void dispatch(loadTranscript(labId));
  }, [labId, online, dispatch]);
  const pending = useAppSelector((s) => Boolean(selectLabParams(s, labId).pending));
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const turns = st.turns;
  const busy = turns.some((t) => t.status === 'running');
  const board = ir.boards.find((b) => b.id === boardId);
  const suggestions = useMemo(() => repliesFor(labId, boardId, ir, pending).map((r) => r.prompt), [labId, boardId, ir, pending]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [turns.length, turns[turns.length - 1]?.status]);
  const ask = (p: string) => {
    if (!p.trim() || busy || !board) return;
    setText('');
    void dispatch(askAgent(labId, boardId, p.trim()));
  };
  const pick = (spec: string, thinking?: string) => {
    const info = models.find((m) => m.spec === spec);
    const levels = info?.thinking ?? [];
    // keep the thinking level when the new model has it, otherwise the strongest it offers below max
    const t = thinking && levels.includes(thinking) ? thinking : levels.includes(chosenThinking) ? chosenThinking : (levels.filter((l) => l !== 'max').at(-1) ?? levels[0] ?? 'off');
    dispatch(setModel(`${spec}:${t}`));
  };
  if (view === 'library') return <TranscriptLibrary labId={labId} />;
  return (
    <div className="agent">
      <div className="agent__head">
        <div className="agent__row">
          <Chip variant="solid">{ASSISTANT.name}</Chip>
          <span className="muted mono agent__scope">
            on B-{String((board?.index ?? 0) + 1).padStart(2, '0')} · {ASSISTANT.can.join(' · ')} · runs need your approval
          </span>
        </div>
        <div className="agent__row agent__controls">
          <Segmented
            size="sm"
            label="Assistant mode"
            value={liveReady ? mode : 'scripted'}
            onChange={(v) => dispatch(setMode(v as 'scripted' | 'live'))}
            options={[
              { value: 'scripted', label: 'Scripted' },
              { value: 'live', label: 'Live', disabled: !liveReady },
            ]}
          />
          {liveReady && mode === 'live' && models.length ? (
            <>
              <SelectBox
                label="Model"
                value={chosenInfo ? chosenSpec : ''}
                onChange={(v) => pick(v)}
                options={[
                  ...(chosenInfo ? [] : [{ value: '', label: `${chosenSpec || 'default'} (not available)`, disabled: true }]),
                  ...models.map((m) => ({ value: m.spec, label: m.name, group: m.provider })),
                ]}
              />
              {chosenInfo && chosenInfo.thinking.length > 1 ? (
                <SelectBox label="Thinking" value={chosenThinking} onChange={(v) => pick(chosenSpec, v)} options={chosenInfo.thinking.map((t) => ({ value: t, label: `thinking: ${t}` }))} />
              ) : null}
            </>
          ) : (
            <span className="muted mono agent__model" title={liveReady ? 'resolved through the pi agent; transcripts are stored by the lab server' : (model?.reason ?? 'the lab server is offline')}>
              {liveReady ? 'scripted replies' : online ? `live unavailable: ${model?.reason ?? 'no model'}` : 'live needs the lab server'}
            </span>
          )}
          <span className="agent__actions">
            <IconButton size="sm" icon="library" label="Transcript library" onClick={() => dispatch(setView('library'))} disabled={!online} />
            <IconButton size="sm" icon="archive" label="Clear the transcript (it moves to the library)" onClick={() => void dispatch(clearTranscript(labId))} disabled={busy || !turns.length} />
          </span>
        </div>
      </div>
      <div className="agent__log" ref={log}>
        <div className="turn turn--agent">
          <p>I work on the board in view: I can query its runs, move its parameters, annotate hypotheses and propose runs that you approve. Observed values are read-only to me.{liveReady && mode === 'live' ? ' In Live mode a model writes the code; it runs here, and I read its result before answering.' : ''}</p>
        </div>
        {turns.map((t) => (
          <TurnView key={t.id} turn={t} current={boardId} />
        ))}
      </div>
      <div className="agent__foot">
        {suggestions.length ? (
          <div className="agent__sugs" aria-label="Suggested prompts for this board">
            {suggestions.map((s) => (
              <button key={s} type="button" className="agent__sug" disabled={busy} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="agent__form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
        >
          <input id="agent-input" aria-label="Ask the assistant about this board" placeholder="Ask about this board…" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
};
